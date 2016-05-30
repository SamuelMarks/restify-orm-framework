import * as restify from 'restify';
import * as Waterline from 'waterline';
import {WLError, waterline, Collection, ConfigOptions} from 'waterline';
import * as async from 'async';
import {createLogger, Logger} from 'bunyan';
import {WaterlineError} from 'restify-errors';
import {RedisClient, createClient} from 'redis';
import {IModelRoute} from 'nodejs-utils';

export function strapFramework(kwargs: {
    models_and_routes: IModelRoute,
    logger: Logger,
    _cache: {},
    package_: {version: number},
    root?: string,
    start_app?: boolean,
    skip_db?: boolean,
    collections?: Waterline.Query[],
    waterline_config?: ConfigOptions,
    use_redis?: boolean,
    redis_cursors?: { redis: RedisClient },
    createSampleData?: boolean,
    SampleData?: any,
    sampleDataToCreate?: (SampleData: any) => Array<any>,
    callback?: (app: restify.Server, connections?: any[], collections?: Waterline.Query[]) => void
}) {
    if (kwargs.root === undefined) kwargs.root = '/api';
    if (kwargs.start_app === undefined) kwargs.start_app = true;
    if (kwargs.skip_db === undefined) kwargs.skip_db = true;
    if (kwargs.use_redis === undefined) kwargs.use_redis = false;
    if (kwargs.createSampleData === undefined) kwargs.createSampleData = !process.env.NO_SAMPLE_DATA;

    // Init server obj
    let app = restify.createServer();

    app.use(restify.queryParser());
    app.use(restify.bodyParser());

    app.on('WLError', (req: restify.Request, res: restify.Response,
                       err: WLError, next: restify.Next) => {
        return next(new WaterlineError(err));
    });

    app.on('after', restify.auditLogger({
        log: createLogger({
            name: 'audit',
            stream: process.stdout
        })
    }));

    ['/', '/version', '/api', '/api/version'].map(route_path => app.get(
        route_path,
        (req: restify.Request, res: restify.Response, next: restify.Next) => {
            res.json({version: kwargs.package_.version});
            next()
        }
    ));

    // Init database obj
    const waterline: waterline = new Waterline();

    function tryTblInit(entity) {
        return function tryInit(model) {
            kwargs.models_and_routes[entity].models
            && (kwargs.models_and_routes[entity].models[model].identity
            ||
            kwargs.models_and_routes[entity].models[model].tableName)
                ?
                waterline.loadCollection(
                    Collection.extend(
                        kwargs.models_and_routes[entity].models[model]
                    )
                )
                : kwargs.logger.warn(`Not initialising: ${entity}.${model}`)
        }
    }

    //models_and_routes['contact'] && tryTblInit('contact')('Contact');

    Object.keys(kwargs.models_and_routes).map(entity => {
        // Merge routes
        if (kwargs.models_and_routes[entity].routes)
            Object.keys(kwargs.models_and_routes[entity].routes).map(
                route => kwargs.models_and_routes[entity].routes[route](
                    app, `${kwargs.root}/${entity}`
                )
            );

        // Merge models
        if (kwargs.models_and_routes[entity].models)
            Object.keys(kwargs.models_and_routes[entity].models).map(tryTblInit(entity));
    });

    if (kwargs.callback && kwargs.skip_db && !kwargs.start_app)
        return kwargs.callback(app);

    if (kwargs.use_redis) {
        kwargs.redis_cursors.redis = createClient(process.env.REDIS_URL);
        kwargs.redis_cursors.redis.on('error', function (err) {
            kwargs.logger.error(`Redis::error event -
            ${kwargs.redis_cursors.redis['host']}:${kwargs.redis_cursors.redis['port']}
            - ${err}`);
            kwargs.logger.error(err);
        });
    }

    // Create/init database models, populated exported collections, serve API
    waterline.initialize(kwargs.waterline_config, function (err, ontology) {
        if (err !== null) throw err;

        // Tease out fully initialised models.
        kwargs.collections = <Waterline.Query[]>(ontology.collections);
        kwargs.logger.info(
            'ORM initialised with collections:', Object.keys(kwargs.collections)
        );

        kwargs._cache['collections'] = kwargs.collections; // pass by reference

        if (kwargs.callback && kwargs.start_app === false)
            return kwargs.callback(app, ontology.connections, kwargs.collections); // E.g.: for testing
        else if (kwargs.start_app) // Start API server
            app.listen(process.env.PORT || 3000, function () {
                kwargs.logger.info('%s listening at %s', app.name, app.url);

                if (kwargs.createSampleData && kwargs.sampleDataToCreate) {
                    const sampleData = new kwargs.SampleData(app.url);
                    async.series((kwargs.sampleDataToCreate)(sampleData), (err, results) =>
                        err ? console.error(err) : console.info(results)
                    );
                }
                if (kwargs.callback)
                    return kwargs.callback(app, ontology.connections, kwargs.collections)
            });
    });
}