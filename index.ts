import { dirname } from 'path';
import * as restify from 'restify';
import { auditLogger, bodyParser, queryParser } from 'restify-plugins';
import * as Waterline from 'waterline';
import { Collection, waterline, WLError } from 'waterline';
import { createLogger } from 'bunyan';
import { WaterlineError } from 'custom-restify-errors';
import * as Redis from 'ioredis';
import { IStrapFramework } from 'restify-waterline-utils';

export const strapFramework = (kwargs: IStrapFramework) => {
    if (kwargs.root == null) kwargs.root = '/api';
    if (kwargs.app_logging == null) kwargs.app_logging = true;
    if (kwargs.start_app == null) kwargs.start_app = true;
    if (kwargs.listen_port == null) /* tslint:disable:no-bitwise */
        kwargs.listen_port = typeof process.env['PORT'] === 'undefined' ? 3000 : ~~process.env['PORT'];
    if (kwargs.skip_db == null) kwargs.skip_db = true;
    if (kwargs.use_redis == null) kwargs.use_redis = false;
    else if (kwargs.use_redis && kwargs.redis_config == null)
        kwargs.redis_config = process.env['REDIS_URL'] == null ? { port: 6379 } : process.env['REDIS_URL'];

    // Init server obj
    const app = restify.createServer(Object.assign({ name: kwargs.app_name }, kwargs.createServerArgs || {}));

    app.use(queryParser());
    app.use(bodyParser());

    app.on('WLError', (req: restify.Request, res: restify.Response,
                       err: WLError, next: restify.Next) =>
        next(new WaterlineError(err))
    );

    if (kwargs.app_logging)
        app.on('after', auditLogger({
            log: createLogger({
                name: 'audit',
                stream: process.stdout
            })
        }) as any);

    ['/', '/version', '/api', '/api/version'].map(route_path => app.get(route_path,
        (req: restify.Request, res: restify.Response, next: restify.Next) => {
            res.json({ version: kwargs.package_.version });
            return next();
        }
    ));

    // Init database obj
    const waterline_obj: waterline = new Waterline();

    const tryTblInit = (program: any, models_set: Set<string>, norm_set: Set<string>) =>
        Object.keys(program).forEach(entity =>
            program[entity] != null && (program[entity].identity || program[entity].tableName) ?
                models_set.add(entity) && waterline_obj.loadCollection(Collection.extend(program[entity]))
                : norm_set.add(entity)
        );

    // models_and_routes['contact'] && tryTblInit('contact')('Contact');
    const routes = new Set<string>();
    const models = new Set<string>();
    const norm = new Set<string>();

    for (const [fname, program] of kwargs.models_and_routes)
        if (program != null)
            if (fname.indexOf('model') > -1 && !kwargs.skip_db) /* Merge models */
                tryTblInit(program, models, norm);
            else /* Merge routes */ routes.add(Object.keys(program).map((route: string) =>
                (program[route] as ((app: restify.Server, namespace: string) => void))(
                    app, `${kwargs.root}/${dirname(fname)}`
                )
            ) && dirname(fname));
    kwargs.logger.info('Registered routes:', Array.from(routes.keys()).join('; '), ';');
    kwargs.logger.warn('Failed registering models:', Array.from(norm.keys()).join('; '), ';');
    kwargs.logger.info('Registered models:', Array.from(models.keys()).join('; '), ';');

    if (kwargs.use_redis) {
        kwargs.redis_cursors.redis = new Redis(kwargs.redis_config);
        kwargs.redis_cursors.redis.on('error', err => {
            kwargs.logger.error(`Redis::error event -
            ${kwargs.redis_cursors.redis['host']}:${kwargs.redis_cursors.redis['port']}s- ${err}`);
            kwargs.logger.error(err);
        });
    }

    if (kwargs.skip_db)
        if (kwargs.start_app)
            app.listen(kwargs.listen_port, () => {
                kwargs.logger.info('%s listening at %s', app.name, app.url);

                return kwargs.callback == null ? null
                    : kwargs.callback(null, app, Object.freeze([]) as any[], Object.freeze([]) as any[]);
            });
        else if (kwargs.callback != null)
            return kwargs.callback(null, app, Object.freeze([]) as any[], Object.freeze([]) as any[]);

    // Create/init database models, populated exported collections, serve API
    waterline_obj.initialize(kwargs.waterline_config, (err, ontology) => {
        if (err != null) {
            if (kwargs.callback != null) return kwargs.callback(err);
            throw err;
        } else if (ontology == null || ontology.connections == null || ontology.collections == null
            || ontology.connections.length === 0 || ontology.collections.length === 0) {
            kwargs.logger.error('ontology =', ontology, ';');
            const error = new TypeError('Expected ontology with connections & collections');
            if (kwargs.callback != null) return kwargs.callback(error);
            throw error;
        }

        // Tease out fully initialised models.
        kwargs.collections = ontology.collections as Waterline.Query[];
        kwargs.logger.info('ORM initialised with collections:', Object.keys(kwargs.collections), ';');

        kwargs._cache['collections'] = kwargs.collections; // pass by reference

        // const handleEnd = () => {
        if (kwargs.start_app) // Start API server
            app.listen(process.env['PORT'] || 3000, () => {
                kwargs.logger.info('%s listening from %s;', app.name, app.url);

                if (kwargs.onServerStart != null) /* tslint:disable:no-empty*/
                    kwargs.onServerStart(app.url, ontology.connections, kwargs.collections, app,
                        kwargs.callback == null ? () => {} : kwargs.callback);
                else if (kwargs.callback != null)
                    return kwargs.callback(null, app, ontology.connections, kwargs.collections);
                return;
            });
        else if (kwargs.callback != null)
            return kwargs.callback(null, app, ontology.connections, kwargs.collections); // E.g.: for testing
        // };
        /*
         if (kwargs.onDbInit) {
         if (kwargs.onDbInitCb == null)
         kwargs.onDbInitCb = (error: Error, connections: Waterline.Connection[],
         collections: Waterline.Collection[], finale: () => void): void => {
         if (error != null) {
         if (kwargs.callback != null) return kwargs.callback(error);
         throw error;
         }
         ontology.connections = connections;
         ontology.collections = collections;
         return finale();
         };
         return kwargs.onDbInit(app, ontology.connections, kwargs.collections, handleEnd, kwargs.onDbInitCb);
         }
         else
         return handleEnd();
         */
    });
};

export const add_to_body_mw = (...updates: Array<[string, string]>): restify.RequestHandler =>
    (req: restify.Request, res: restify.Response, next: restify.Next) => {
        /* tslint:disable:no-unused-expression */
        req.body && updates.map(pair => req.body[pair[0]] = updates[pair[1]]);
        return next();
    };
