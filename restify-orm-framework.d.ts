import * as bunyan from 'bunyan';
import * as restify from 'restify';
import * as redis from 'ioredis';
import * as sequelize from 'sequelize';
import * as typeorm from 'typeorm';
import * as waterline from 'waterline';

export type DbInitCb = (err: Error, datastores: waterline.Connection[], collections: waterline.Query[],
                        finale: () => void) => void;

export interface IOrmsIn {
    redis?: {
        skip: boolean;
        config?: redis.RedisOptions | string;
    };
    sequelize?: {
        skip: boolean;
        uri?: string;
        config?: sequelize.Options;
    };
    typeorm?: {
        skip: boolean;
        config?: typeorm.ConnectionOptions;
    };
    waterline?: {
        skip: boolean;
        config?: waterline.ConfigOptions;
    };
}

export interface IOrmsOut {
    redis?: {
        connection: redis.Redis
    };
    sequelize?: {
        connection: sequelize.Sequelize,
        entities?: Map<string, sequelize.Instance<{}> & sequelize.Model<{}, {}>>
    };
    typeorm?: {
        connection: typeorm.Connection
    };
    waterline?: {
        connection: waterline.Connection[],
        collections?: waterline.Query[]
    };
}

export interface IStrapFramework {
    models_and_routes: Map<string, {
        create?: restify.RequestHandler, read?: restify.RequestHandler,
        update?: restify.RequestHandler, del?: restify.RequestHandler
    } | {} | any> | {}; // ^ Could have more than CRUD, but this is better than `any` or `{}`

    omit_models?: string[];
    orms_in: IOrmsIn;

    // Restify options:
    logger: bunyan;
    package_: {version: number};
    app_name: string;
    createServerArgs?: restify.ServerOptions;
    root?: string;
    listen_port?: number;
    skip_app_logging?: boolean;
    skip_app_version_routes?: boolean;
    skip_start_app?: boolean;

    onServerStart?: (uri: string, app: restify.Server, orms_out: IOrmsOut, next) => void;
    /*onDbInitCb?: DbInitCb;
    onDbInit?: (app: restify.Server, datastores: Connection[], collections: Query[],
                finale: () => void, next: DbInitCb) => void;*/

    // E.g.: for testing:
    callback?: (err: Error | waterline.WLError, app?: restify.Server, orms_out?: IOrmsOut) => void;
}

export declare const tearDownRedisConnection: (connection: redis.Redis, done: (error?: any) => any) => any;
export declare const tearDownSequelizeConnection: (connection: sequelize.Sequelize, done: (error?: any) => any) => any;
export declare const tearDownTypeOrmConnection: (connection: typeorm.Connection, done: (error?: any) => any) => any;
export declare const tearDownWaterlineConnection: (connections: waterline.Connection[],
                                                   done: (error?: any) => any) => any;
export declare const tearDownConnections: (orms: IOrmsOut, done: (error?: any) => any) => void;
export declare const strapFramework: (kwargs: IStrapFramework) => void;
export declare const add_to_body_mw: (...updates: Array<[string, string]>) => restify.RequestHandler;
