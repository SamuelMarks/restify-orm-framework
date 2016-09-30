import * as restify from 'restify';
import * as Waterline from 'waterline';
import {WLError, waterline, Collection} from 'waterline';
import * as async from 'async';
import {createLogger} from 'bunyan';
import {WaterlineError} from 'restify-errors';
import {createClient} from 'redis';
import {IStrapFramework} from 'restify-utils';

export function strapFramework(kwargs: IStrapFramework) {
    if (kwargs.root === undefined) kwargs.root = '/api';
    if (kwargs.app_logging === undefined) kwargs.app_logging = true;
    if (kwargs.start_app === undefined) kwargs.start_app = true;
    if (kwargs.skip_db === undefined) kwargs.skip_db = true;
    if (kwargs.use_redis === undefined) kwargs.use_redis = false;
    if (kwargs.createSampleData === undefined) kwargs.createSampleData = !process.env['NO_SAMPLE_DATA'];

    // Init server obj
    const app = restify.createServer({name: kwargs.app_name});

    app.use(restify.queryParser());
    app.use(restify.bodyParser());

    app.on('WLError', (req: restify.Request, res: restify.Response,
                       err: WLError, next: restify.Next) =>
        next(new WaterlineError(err))
    );

    if (kwargs.app_logging)
        app.on('after', restify.auditLogger({
            log: createLogger({
                name: 'audit',
                stream: process.stdout
            })
        }));

    ['/', '/version', '/api', '/api/version'].map(route_path => app.get(route_path,
        (req: restify.Request, res: restify.Response, next: restify.Next) => {
            res.json({version: kwargs.package_.version});
            return next();
        }
    ));

    function tryTblInit(entity) {
        return model => {
            kwargs.models_and_routes[entity].models
            && (kwargs.models_and_routes[entity].models[model].identity
            || kwargs.models_and_routes[entity].models[model].tableName) ?
                waterline.loadCollection(
                    Collection.extend(
                        kwargs.models_and_routes[entity].models[model]
                    )
                ) : kwargs.logger.warn(`Not initialising: ${entity}.${model}`)
        }
    }

    //models_and_routes['contact'] && tryTblInit('contact')('Contact');

    // Init database obj
    const waterline: waterline = new Waterline();

    Object.keys(kwargs.models_and_routes).map(entity => {
        // Merge routes
        if (kwargs.models_and_routes[entity].routes)
            Object.keys(kwargs.models_and_routes[entity].routes).map(
                route => kwargs.models_and_routes[entity].routes[route](
                    app, `${kwargs.root}/${entity}`
                )
            );

        if (kwargs.models_and_routes[entity].route)
            Object.keys(kwargs.models_and_routes[entity].route).map(
                route => kwargs.models_and_routes[entity].route[route](
                    app, `${kwargs.root}/${entity}`
                )
            );

        // Merge models
        if (!kwargs.skip_db && kwargs.models_and_routes[entity].models)
            Object.keys(kwargs.models_and_routes[entity].models).map(tryTblInit(entity));
    });

    if (kwargs.use_redis) {
        kwargs.redis_cursors.redis = createClient(process.env['REDIS_URL']);
        kwargs.redis_cursors.redis.on('error', err => {
            kwargs.logger.error(`Redis::error event -
            ${kwargs.redis_cursors.redis['host']}:${kwargs.redis_cursors.redis['port']}s- ${err}`);
            kwargs.logger.error(err);
        });
    }

    if (kwargs.skip_db)
        if (kwargs.start_app)
            app.listen(process.env['PORT'] || 3000, () => {
                kwargs.logger.info('%s listening at %s', app.name, app.url);

                return kwargs.callback ? kwargs.callback(null, app, Object.freeze([]), Object.freeze([])) : null;
            });
        else if (kwargs.callback)
            return kwargs.callback(null, app, Object.freeze([]), Object.freeze([]));

    // Create/init database models, populated exported collections, serve API
    waterline.initialize(kwargs.waterline_config, (err, ontology) => {
        if (err !== null) {
            if (kwargs.callback) return kwargs.callback(err);
            throw err;
        }

        // Tease out fully initialised models.
        kwargs.collections = <Waterline.Query[]>(ontology.collections);
        kwargs.logger.info('ORM initialised with collections:', Object.keys(kwargs.collections));

        kwargs._cache['collections'] = kwargs.collections; // pass by reference

        if (kwargs.start_app) // Start API server
            app.listen(process.env['PORT'] || 3000, () => {
                kwargs.logger.info('%s listening at %s', app.name, app.url);

                if (kwargs.createSampleData && kwargs.sampleDataToCreate)
                    async.series((kwargs.sampleDataToCreate)(new kwargs.SampleData(app.url)), (err, results) =>
                        err ? console.error(err) : console.info(results)
                    );
                if (kwargs.callback)
                    return kwargs.callback(null, app, ontology.connections, kwargs.collections);
                return;
            });
        else if (kwargs.callback)
            return kwargs.callback(null, app, ontology.connections, kwargs.collections); // E.g.: for testing
    });
}

export function add_to_body_mw(...updates: Array<[string, string]>): restify.RequestHandler {
    return function (req: restify.Request, res: restify.Response, next: restify.Next) {
        req.body && updates.map(pair => req.body[pair[0]] = updates[pair[1]]);
        return next();
    }
}
