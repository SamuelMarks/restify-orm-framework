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
import { IOrmsOut, IStrapFramework } from 'restify-orm-framework';
import { model_route_to_map } from 'nodejs-utils';
import * as sequelize from 'sequelize';
import { Connection as TypeOrmConnection, createConnection } from 'typeorm';
import 'reflect-metadata';

const populateModels = (program: any,
                        omit_models: string[],
                        norm_set: Set<any>,
                        waterline_set: Set<any>,
                        typeorm_map: Map<string, any>,
                        sequelize_map: Map<string, any>) =>
    Object
        .keys(program)
        .filter(entity => program[entity] != null && omit_models.indexOf(entity) === -1)
        .forEach(entity => {
            if (program[entity].identity || program[entity].tableName)
                waterline_set.add(program[entity]);
            else if (typeof program[entity] === 'function')
                if (program[entity].toString().indexOf('sequelize') > -1)
                    sequelize_map.set(entity, program[entity]);
                else if (program[entity].toString().indexOf('class') > -1)
                    typeorm_map.set(entity, program[entity]);
                else norm_set.add(entity);
            else norm_set.add(entity);
        });

const handleStartApp = (kwargs: IStrapFramework, app: restify.Server,
                        waterline_connections?: Connection[],
                        waterline_collections?: typeof kwargs.waterline_collections,
                        typeorm_connection?: TypeOrmConnection,
                        sequelize_connection?: sequelize.Sequelize) => {
    const orms_out: IOrmsOut = Object.freeze({
        sequelize: {
            connection: sequelize_connection
        },
        typeorm: {
            connection: typeorm_connection
        },
        waterline: {
            connection: waterline_connections,
            collections: kwargs.waterline_collections
        }
    });
    return kwargs.skip_start_app ? kwargs.callback != null && kwargs.callback(null, app, orms_out)
        : app.listen(kwargs.listen_port, () => {
            kwargs.logger.info('%s listening at %s', app.name, app.url);

            if (kwargs.onServerStart != null)
                return kwargs.onServerStart(app.url, app, orms_out,
                    kwargs.callback == null ? /* tslint:disable:no-empty*/ () => {} : kwargs.callback
                );
            else if (kwargs.callback != null)
                return kwargs.callback(null, app, orms_out);
        });
};

const waterlineHandler = (kwargs: IStrapFramework,
                          app: restify.Server,
                          waterline_set: Set<string>,
                          callback: (err, ...args) => void) => {
    if (kwargs.skip_waterline) return callback(void 0);

    const waterline_obj: waterline = new Waterline();
    // Create/init database models and populates exported `waterline_collections`
    Array.from(waterline_set.values()).forEach(e => waterline_obj.loadCollection(Collection.extend(e)));
    waterline_obj.initialize(kwargs.waterline_config, (err, ontology) => {
        if (err != null)
            return callback(err);
        else if (ontology == null || ontology.connections == null || ontology.collections == null
            || ontology.connections.length === 0 || ontology.collections.length === 0) {
            kwargs.logger.error('waterline_obj.initialize::ontology =', ontology, ';');
            return callback(new TypeError('Expected ontology with connections & waterline_collections'));
        }

        // Tease out fully initialised models.
        kwargs.waterline_collections = ontology.collections as Waterline.Query[];
        kwargs.logger.info('Waterline initialised with:', Object.keys(kwargs.waterline_collections), ';');

        kwargs._cache['waterline_collections'] = kwargs.waterline_collections; // pass by reference

        return callback(null, { connections: ontology.connections, collections: kwargs.waterline_collections });
    });
};

const typeormHandler = (kwargs: IStrapFramework, typeorm: Map<string, any>, callback: (err, ...args) => void) => {
    if (kwargs.skip_typeorm) return callback(void 0);
    kwargs.logger.info('TypeORM initialising with:', Array.from(typeorm.keys()), ';');
    try {
        return createConnection(Object.assign({
                entities: Array.from(typeorm.values())
            }, kwargs.typeorm_config
        )).then(connection => callback(null, connection)).catch(callback);
    } catch (e) {
        return callback(e);
    }
};

const sequelizeHandler = (kwargs: IStrapFramework,
                          app: restify.Server,
                          sequelize_map: Map<string, any>,
                          callback: (err, ...args) => void) => {
    if (kwargs.skip_sequelize) return callback(void 0);
    kwargs.logger.info('Sequelize initialising with:', Array.from(sequelize_map.keys()), ';');
    const sequelize_obj = new sequelize.Sequelize(kwargs.sequelize_config as any);
    Array.from(sequelize_map.values()).forEach(e => e(sequelize_obj));
    return callback(void 0, sequelize_obj);
};

export const tearDownWaterlineConnections = (connections: Connection[], done: (error?: any) => any) =>
    connections ? parallel(Object.keys(connections).map(
        connection => connections[connection]._adapter.teardown
    ), () => {
        Object.keys(connections).forEach(connection => {
            if (['sails-tingo', 'waterline-nedb'].indexOf(connections[connection]._adapter.identity) < 0)
                connections[connection]._adapter.connections.delete(connection);
        });
        return done();
    }) : done();

export const tearDownTypeOrmConnection = (connection: TypeOrmConnection, done: (error?: any) => any) =>
    connection != null && connection.isConnected ? connection.close().then(_ => done()).catch(done) : done();

export const strapFramework = (kwargs: IStrapFramework) => {
    if (kwargs.root == null) kwargs.root = '/api';
    if (kwargs.skip_app_logging == null) kwargs.skip_app_logging = true;
    if (kwargs.skip_app_version_routes == null) kwargs.skip_app_version_routes = true;
    if (kwargs.skip_start_app == null) kwargs.skip_start_app = false;
    else if (kwargs.listen_port == null) /* tslint:disable:no-bitwise */
        kwargs.listen_port = typeof process.env['PORT'] === 'undefined' ? 3000 : ~~process.env['PORT'];
    if (kwargs.skip_sequelize == null) kwargs.skip_sequelize = true;
    if (kwargs.skip_typeorm == null) kwargs.skip_typeorm = true;
    if (kwargs.skip_waterline == null) kwargs.skip_waterline = true;
    if (kwargs.skip_redis == null) kwargs.skip_redis = true;
    else if (kwargs.redis_config == null)
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

    if (!kwargs.skip_app_version_routes)
        ['/', '/version', '/api', '/api/version'].map(route_path => app.get(route_path,
            (req: restify.Request, res: restify.Response, next: restify.Next) => {
                res.json({ version: kwargs.package_.version });
                return next();
            }
        ));

    // models_and_routes['contact'] && populateModels('contact')('Contact');
    const routes = new Set<string>();
    const norm = new Set<string>();
    const waterline_set = new Set<any /*program*/>();
    const typeorm_map = new Map<string, any /*program*/>();
    const sequelize_map = new Map<string, any /*program*/>();

    if (!(kwargs.models_and_routes instanceof Map))
        kwargs.models_and_routes = model_route_to_map(kwargs.models_and_routes);
    for (const [fname, program] of kwargs.models_and_routes as Map<string, any>)
        if (program != null)
            if /* Merge models */ (fname.indexOf('model') > -1 && (!kwargs.skip_waterline || !kwargs.skip_typeorm))
                populateModels(
                    program, kwargs.omit_models || ['AccessToken'], norm,
                    waterline_set, typeorm_map, sequelize_map
                );
            else /* Merge routes */ /* tslint:disable:no-unused-expression */
                typeof program === 'object' && Object.keys(program).map((route: string) =>
                    (program[route] as ((app: restify.Server, namespace: string) => void))(
                        app, `${kwargs.root}/${dirname(fname)}`
                    )
                ) && routes.add(dirname(fname));

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
        sequelize: cb => sequelizeHandler(kwargs, app, sequelize_map, cb),
        typeorm: cb => typeormHandler(kwargs, typeorm_map, cb),
        waterline: cb => waterlineHandler(kwargs, app, waterline_set, cb),
    }, (err: Error, result: {sequelize, typeorm, waterline}) => {
        if (err != null) {
            if (kwargs.callback) return kwargs.callback(err);
            throw err;
        }
        return handleStartApp(
            kwargs, app, (result.waterline || {}).connections, (result.waterline || {}).collections,
            result.typeorm, result.sequelize
        );
    });
};

export const add_to_body_mw = (...updates: Array<[string, string]>): restify.RequestHandler =>
    (req: restify.Request, res: restify.Response, next: restify.Next) => {
        /* tslint:disable:no-unused-expression */
        req.body && updates.map(pair => req.body[pair[0]] = updates[pair[1]]);
        return next();
    };
