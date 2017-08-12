import 'reflect-metadata';

import * as Logger from 'bunyan';
import * as restify from 'restify';
import * as Redis from 'ioredis';
import * as sequelize from 'sequelize';
import { Sequelize } from 'sequelize';
import * as typeorm from 'typeorm';
import * as Waterline from 'waterline';

import { dirname } from 'path';
import { parallel } from 'async';
import { auditLogger, bodyParser, queryParser } from 'restify-plugins';
import { WaterlineError } from 'custom-restify-errors';
import { IOrmsOut, IStrapFramework } from 'restify-orm-framework';
import { model_route_to_map } from 'nodejs-utils';

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

const handleStartApp = (skip_start_app: boolean,
                        app: restify.Server,
                        listen_port: number,
                        onServerStart: IStrapFramework['onServerStart'],
                        logger: Logger,
                        orms_out: IOrmsOut,
                        callback: IStrapFramework['callback']) =>
    skip_start_app ? callback != null && callback(null, app, orms_out)
        : app.listen(listen_port, () => {
            logger.info('%s listening at %s', app.name, app.url);

            if (onServerStart != null)
                return onServerStart(app.url, app, orms_out,
                    callback == null ? /* tslint:disable:no-empty*/ () => {} : callback
                );
            else if (callback != null)
                return callback(null, app, orms_out);
        });

const redisHandler = (orm: {skip: boolean, config?: Redis.RedisOptions | string},
                      logger: Logger, callback: (err, ...args) => void) => {
    if (orm.skip) return callback(void 0);

    const cursor = new Redis(orm.config as Redis.RedisOptions);
    cursor.on('error', err => {
        logger.error(`Redis::error event - ${cursor['options']['host']}:${cursor['options']['port']} - ${err}`);
        logger.error(err);
        return callback(err); // TODO: Check if `callback` has been called
    });
    cursor.on('connect', () => {
        logger.info(`Redis client connected to:\t ${cursor['options']['host']}:${cursor['options']['port']}`);
        return callback(void 0, { connection: cursor });
    });
};

const sequelizeHandler = (orm: {skip: boolean, uri?: string, config?: sequelize.Options, map: Map<string, any>},
                          logger: Logger, callback: (err, ...args) => void) => {
    if (orm.skip) return callback(void 0);

    logger.info('Sequelize initialising with:\t', Array.from(orm.map.keys()), ';');
    const sequelize_obj: sequelize.Sequelize = new sequelize['Sequelize'](orm.uri, orm.config);

    const entities = new Map<string, sequelize.Instance<{}> & sequelize.Model<{}, {}>>();
    for (const [entity, program] of orm.map)
        entities.set(entity, program(sequelize_obj));
    sequelize_obj
        .authenticate()
        .then(() => callback(void 0, { connection: sequelize_obj, entities }))
        .catch(callback);
};

const typeormHandler = (orm: {skip: boolean, uri?: string, config?: typeorm.ConnectionOptions, map: Map<string, any>},
                        logger: Logger, callback: (err, ...args) => void) => {
    if (orm.skip) return callback(void 0);

    logger.info('TypeORM initialising with:\t', Array.from(orm.map.keys()), ';');
    try { // TODO: `uri` handling
        return typeorm.createConnection(Object.assign({
                entities: Array.from(orm.map.values())
            }, orm.config
        )).then(connection => callback(null, { connection })).catch(callback);
    } catch (e) {
        return callback(e);
    }
};

const waterlineHandler = (orm: {skip: boolean, config?: Waterline.ConfigOptions, set: Set<string>},
                          logger: Logger, callback: (err, ...args) => void) => {
    if (orm.skip) return callback(void 0);

    const waterline_obj = new Waterline();
    // Create/init database models and populates exported `waterline_collections`
    Array
        .from(orm.set.values())
        .forEach(e => waterline_obj.loadCollection(Waterline.Collection.extend(e)));
    waterline_obj.initialize(orm.config, (err, ontology) => {
        if (err != null)
            return callback(err);
        else if (ontology == null || ontology.connections == null || ontology.collections == null
            || ontology.connections.length === 0 || ontology.collections.length === 0) {
            logger.error('waterline_obj.initialize::ontology =', ontology, ';');
            return callback(new TypeError('Expected ontology with connections & waterline_collections'));
        }

        // Tease out fully initialised models.
        logger.info('Waterline initialised with:\t', Object.keys(ontology.collections), ';');
        return callback(null, { connection: ontology.connections, collections: ontology.collections });
    });
};

export const tearDownRedisConnection = (connection: Redis.Redis, done: (error?: any) => any) =>
    connection == null ? done(void 0) : done(connection.disconnect());

export const tearDownSequelizeConnection = (connection: sequelize.Sequelize, done: (error?: any) => any) =>
    connection == null ? done(void 0) : done(connection.close());

export const tearDownTypeOrmConnection = (connection: typeorm.Connection, done: (error?: any) => any) =>
    connection == null || !connection.isConnected ? done(void 0) : connection.close().then(_ => done()).catch(done);

export const tearDownWaterlineConnection = (connections: Waterline.Connection[], done: (error?: any) => any) =>
    connections ? parallel(Object.keys(connections).map(
        connection => connections[connection]._adapter.teardown
    ), () => {
        Object.keys(connections).forEach(connection => {
            if (['sails-tingo', 'waterline-nedb'].indexOf(connections[connection]._adapter.identity) < 0)
                connections[connection]._adapter.connections.delete(connection);
        });
        return done();
    }) : done();

export const tearDownConnections = (orms: IOrmsOut, done: (error?: any) => any) =>
    parallel({
        redis: cb => tearDownRedisConnection((orms.redis || { connection: undefined }).connection, cb),
        sequelize: cb => tearDownSequelizeConnection((orms.sequelize || { connection: undefined }).connection, cb),
        typeorm: cb => tearDownTypeOrmConnection((orms.typeorm || { connection: undefined }).connection, cb),
        waterline: cb => tearDownWaterlineConnection((orms.waterline || { connection: undefined }).connection, cb)
    }, done);

export const strapFramework = (kwargs: IStrapFramework) => {
    if (kwargs.root == null) kwargs.root = '/api';
    if (kwargs.skip_app_logging == null) kwargs.skip_app_logging = true;
    if (kwargs.skip_app_version_routes == null) kwargs.skip_app_version_routes = true;
    if (kwargs.skip_start_app == null) kwargs.skip_start_app = false;
    else if (kwargs.listen_port == null) /* tslint:disable:no-bitwise */
        kwargs.listen_port = typeof process.env['PORT'] === 'undefined' ? 3000 : ~~process.env['PORT'];

    Object.keys(kwargs.orms_in).map(orm => {
        if (kwargs.orms_in[orm].skip == null) kwargs.orms_in[orm].skip = true;
    });
    if (kwargs.orms_in.redis != null && !kwargs.orms_in.redis.skip && kwargs.orms_in.redis.config == null)
        kwargs.orms_in.redis.config = process.env['REDIS_URL'] == null ? { port: 6379 } : process.env['REDIS_URL'];

    // Init server obj
    const app = restify.createServer(Object.assign({ name: kwargs.app_name }, kwargs.createServerArgs || {}));

    app.use(queryParser());
    app.use(bodyParser());

    app.on('WLError', (req: restify.Request, res: restify.Response,
                       err: Waterline.WLError, next: restify.Next) =>
        next(new WaterlineError(err))
    );

    if (!kwargs.skip_app_logging)
        app.on('after', auditLogger({
            log: Logger.createLogger({
                name: 'audit',
                stream: process.stdout
            })
        }));

    if (!kwargs.skip_app_version_routes)
        ['/', '/version', '/api', '/api/version'].map(route_path => app.get(route_path,
            (req: restify.Request, res: restify.Response, next: restify.Next) => {
                res.json({ version: kwargs.package_.version });
                return next();
            }
        ));

    const routes = new Set<string>();
    const norm = new Set<string>();
    const waterline_set = new Set<any /*program*/>();
    const typeorm_map = new Map<string, any /*program*/>();
    const sequelize_map = new Map<string, any /*program*/>();

    const do_models: boolean = Object
        .keys(kwargs.orms_in)
        .filter(orm => orm !== 'Redis')
        .some(orm => kwargs.orms_in[orm].skip === false);

    if (!(kwargs.models_and_routes instanceof Map))
        kwargs.models_and_routes = model_route_to_map(kwargs.models_and_routes);
    for (const [fname, program] of kwargs.models_and_routes as Map<string, any>)
        if (program != null)
            if /* Merge models */ (fname.indexOf('model') > -1 && do_models)
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

    kwargs.logger.info('Restify registered routes:\t', Array.from(routes.keys()), ';');
    kwargs.logger.warn('Failed registering models:\t', Array.from(norm.keys()), ';');

    parallel({
        redis: cb => kwargs.orms_in.redis == null ? cb(void 0) :
            redisHandler(kwargs.orms_in.redis, kwargs.logger, cb),
        sequelize: cb => kwargs.orms_in.sequelize == null ? cb(void 0) :
            sequelizeHandler(Object.assign(kwargs.orms_in.sequelize, { map: sequelize_map }), kwargs.logger, cb),
        typeorm: cb => kwargs.orms_in.typeorm == null ? cb(void 0) :
            typeormHandler(Object.assign(kwargs.orms_in.typeorm, { map: typeorm_map }), kwargs.logger, cb),
        waterline: cb => kwargs.orms_in.waterline == null ? cb(void 0) :
            waterlineHandler(Object.assign(kwargs.orms_in.waterline, { set: waterline_set }), kwargs.logger, cb),
    }, (err: Error, orms_out: IOrmsOut) => {
        if (err != null) {
            if (kwargs.callback) return kwargs.callback(err);
            throw err;
        }
        return handleStartApp(
            kwargs.skip_start_app, app, kwargs.listen_port, kwargs.onServerStart,
            kwargs.logger, orms_out, kwargs.callback
        );
    });
};

export const add_to_body_mw = (...updates: Array<[string, string]>): restify.RequestHandler =>
    (req: restify.Request, res: restify.Response, next: restify.Next) => {
        /* tslint:disable:no-unused-expression */
        req.body && updates.map(pair => req.body[pair[0]] = updates[pair[1]]);
        return next();
    };
