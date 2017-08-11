import * as bunyan from 'bunyan';
import * as restify from 'restify';
import { ConfigOptions, Connection, Query, WLError } from 'waterline';
import { Redis, RedisOptions } from 'ioredis';
import { Connection as TypeOrmConnection, ConnectionOptions } from 'typeorm';
import * as sequelize from 'sequelize';

export type DbInitCb = (err: Error, datastores: Connection[], collections: Query[], finale: () => void) => void;

export interface IOrmsOut {
    sequelize?: {
        connection: sequelize.Sequelize
    };
    typeorm?: {
        connection: TypeOrmConnection
    };
    waterline?: {
        connection: Connection[],
        collections: Query[]
    };
}

export interface IStrapFramework {
    models_and_routes: Map<string, {
        create?: restify.RequestHandler, read?: restify.RequestHandler,
        update?: restify.RequestHandler, del?: restify.RequestHandler
    } | {} | any> | {}; // ^ Could have more than CRUD, but this is better than `any` or `{}`
    logger: bunyan;
    _cache: {};
    package_: {version: number};
    app_name: string;
    root?: string;
    listen_port?: number;
    skip_app_logging?: boolean;
    skip_app_version_routes?: boolean;
    skip_start_app?: boolean;

    skip_redis?: boolean;
    skip_sequelize?: boolean;
    skip_typeorm?: boolean;
    skip_waterline?: boolean;

    waterline_collections?: Query[];
    waterline_config?: ConfigOptions;
    redis_config?: RedisOptions | string;
    redis_cursors?: {redis: Redis};
    typeorm_config?: ConnectionOptions;
    sequelize_config?: sequelize.Options | string;

    omit_models?: string[];

    onServerStart?: (uri: string, app: restify.Server, orms_out: IOrmsOut, next) => void;
    /*onDbInitCb?: DbInitCb;
    onDbInit?: (app: restify.Server, datastores: Connection[], collections: Query[],
                finale: () => void, next: DbInitCb) => void;*/
    createServerArgs?: restify.ServerOptions;
    // E.g.: for testing:
    callback?: (err: Error | WLError, app?: restify.Server, orms_out?: IOrmsOut) => void;
}

export declare const tearDownWaterlineConnections: (connections: Connection[], done: (error?: any) => any) => any;
export declare const tearDownTypeOrmConnection: (connection: TypeOrmConnection, done: (error?: any) => any) => any;
export declare const strapFramework: (kwargs: IStrapFramework) => void;
export declare const add_to_body_mw: (...updates: Array<[string, string]>) => restify.RequestHandler;
