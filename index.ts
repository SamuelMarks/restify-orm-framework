import { dirname } from 'path';
import { parallel } from 'async';
import * as restify from 'restify';
import { auditLogger, bodyParser, queryParser } from 'restify-plugins';
import * as Waterline from 'waterline';
import { Collection, Connection, waterline, WLError } from 'waterline';
import { createLogger } from 'bunyan';
import { WaterlineError } from 'custom-restify-errors';
import * as Redis from 'ioredis';
import { RedisOptions } from 'ioredis';
import { IStrapFramework } from 'restify-orm-framework';
import { model_route_to_map } from 'nodejs-utils';
import { Connection as TypeOrmConnection, createConnection } from 'typeorm';
import 'reflect-metadata';

const populateModels = (waterline_obj: waterline,
                        program: any,
                        models_set: Set<any>,
                        norm_set: Set<any>,
                        typeorm_map: Map<string, any>) =>
    Object
        .keys(program)
        .forEach(entity => {
            if (program[entity] != null)
                if (program[entity].identity || program[entity].tableName) {
                    models_set.add(entity);
                    waterline_obj.loadCollection(Collection.extend(program[entity]));
                } else if (typeof program[entity] === 'function'
                    && program[entity].toString().indexOf('class') > -1
                    && entity !== 'AccessToken') // TODO: Figure out semantics for exclusions
                    typeorm_map.set(entity, program[entity]);
                else norm_set.add(entity);
        });

const handleStartApp = (kwargs: IStrapFramework, app: restify.Server,
                        waterline_connections?: Connection[],
                        waterline_collections?: typeof kwargs.waterline_collections,
                        typeorm_connection?: TypeOrmConnection) =>
    kwargs.skip_start_app ? kwargs.callback != null &&
        kwargs.callback(null, app, waterline_connections, waterline_collections, typeorm_connection)
        : app.listen(kwargs.listen_port, () => {
            kwargs.logger.info('%s listening at %s', app.name, app.url);

            if (kwargs.onServerStart != null) /* tslint:disable:no-empty*/
                return kwargs.onServerStart(app.url, waterline_connections, kwargs.waterline_collections,
                    typeorm_connection, app, kwargs.callback == null ? () => {} : kwargs.callback);
            else if (kwargs.callback != null)
                return kwargs.callback(null, app, waterline_connections, waterline_collections, typeorm_connection);
        });

const waterlineHandler = (kwargs: IStrapFramework,
                          app: restify.Server,
                          waterline_obj: waterline,
                          waterline_models: Set<string>,
                          callback: (err, ...args) => void) => {
    if (kwargs.skip_waterline) return callback(void 0);
    kwargs.logger.info('Registered Waterline models:', Array.from(waterline_models.keys()).join('; '), ';');
    // Create/init database models, populated exported waterline_collections, serve API
    waterline_obj.initialize(kwargs.waterline_config, (err, ontology) => {
        if (err != null)
            return handleErr(kwargs.callback)(err);
        else if (ontology == null || ontology.connections == null || ontology.collections == null
            || ontology.connections.length === 0 || ontology.collections.length === 0) {
            kwargs.logger.error('waterline_obj.initialize::ontology =', ontology, ';');
            return handleErr(kwargs.callback)(
                new TypeError('Expected ontology with connections & waterline_collections')
            );
        }

        // Tease out fully initialised models.
        kwargs.waterline_collections = ontology.collections as Waterline.Query[];
        kwargs.logger.info('Waterline initialised with:', Object.keys(kwargs.waterline_collections), ';');

        kwargs._cache['waterline_collections'] = kwargs.waterline_collections; // pass by reference

        return callback(null, {connections: ontology.connections, collections: kwargs.waterline_collections});
    });
};

const typeormHandler = (kwargs: IStrapFramework, typeorm: Map<string, any>, callback: (err, ...args) => void) => {
    if (kwargs.skip_typeorm) return callback(void 0);
    kwargs.logger.info('TypeORM initialising with:', Array.from(typeorm.keys()), ';');
    try {
        return createConnection(Object.assign({
                entities: Array.from(typeorm.values())
            }, kwargs.typeorm_config
        )).then(connection => callback(null, connection)).catch(handleErr(kwargs.callback));
    } catch (e) {
        return handleErr(e);
    }
};

const handleErr = (callback?: (error: Error | any) => void) => err => {
    if (callback) return callback(err);
    throw err;
};

export const strapFramework = (kwargs: IStrapFramework) => {
    if (kwargs.root == null) kwargs.root = '/api';
    if (kwargs.skip_app_logging == null) kwargs.skip_app_logging = true;
    if (kwargs.skip_start_app == null) kwargs.skip_start_app = false;
    if (kwargs.listen_port == null) /* tslint:disable:no-bitwise */
        kwargs.listen_port = typeof process.env['PORT'] === 'undefined' ? 3000 : ~~process.env['PORT'];
    if (kwargs.skip_waterline == null) kwargs.skip_waterline = true;
    if (kwargs.skip_typeorm == null) kwargs.skip_typeorm = true;
    if (kwargs.skip_redis == null) kwargs.skip_redis = true;
    else if (kwargs.skip_redis && kwargs.redis_config == null)
        kwargs.redis_config = process.env['REDIS_URL'] == null ? { port: 6379 } : process.env['REDIS_URL'];

    // Init server obj
    const app = restify.createServer(Object.assign({ name: kwargs.app_name }, kwargs.createServerArgs || {}));

    app.use(queryParser());
    app.use(bodyParser());

    app.on('WLError', (req: restify.Request, res: restify.Response,
                       err: WLError, next: restify.Next) =>
        next(new WaterlineError(err))
    );

    if (!kwargs.skip_app_logging)
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

    // models_and_routes['contact'] && populateModels('contact')('Contact');
    const routes = new Set<string>();
    const waterline_models = new Set<string>();
    const norm = new Set<string>();
    const typeorm = new Map<string, any /*program*/>();

    if (!(kwargs.models_and_routes instanceof Map))
        kwargs.models_and_routes = model_route_to_map(kwargs.models_and_routes);
    for (const [fname, program] of kwargs.models_and_routes as Map<string, any>)
        if (program != null)
            if /* Merge models */ (fname.indexOf('model') > -1 && (!kwargs.skip_waterline || !kwargs.skip_typeorm))
                populateModels(waterline_obj, program, waterline_models, norm, typeorm);
            else /* Merge routes */ routes.add(Object.keys(program).map((route: string) =>
                (program[route] as ((app: restify.Server, namespace: string) => void))(
                    app, `${kwargs.root}/${dirname(fname)}`
                )
            ) && dirname(fname));

    kwargs.logger.info('Registered routes:', Array.from(routes.keys()).join('; '), ';');
    kwargs.logger.warn('Failed registering models:', Array.from(norm.keys()).join('; '), ';');

    if (!kwargs.skip_redis) {
        kwargs.redis_cursors.redis = new Redis(kwargs.redis_config as any as RedisOptions);
        kwargs.redis_cursors.redis.on('error', err => {
            kwargs.logger.error(`Redis::error event -
            ${kwargs.redis_cursors.redis['host']}:${kwargs.redis_cursors.redis['port']}s- ${err}`);
            kwargs.logger.error(err);
        });
    }

    parallel({
        typeorm: cb => typeormHandler(kwargs, typeorm, cb),
        waterline: cb => waterlineHandler(kwargs, app, waterline_obj, waterline_models, cb),
    }, (err: Error, result: {typeorm, waterline}) => {
        if (err != null) return handleErr(kwargs.callback)(err);
        return handleStartApp(
            kwargs, app, (result.waterline || {}).connections, (result.waterline || {}).collections, result.typeorm
        );
    });
};

export const add_to_body_mw = (...updates: Array<[string, string]>): restify.RequestHandler =>
    (req: restify.Request, res: restify.Response, next: restify.Next) => {
        /* tslint:disable:no-unused-expression */
        req.body && updates.map(pair => req.body[pair[0]] = updates[pair[1]]);
        return next();
    };
