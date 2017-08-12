import * as bunyan from 'bunyan';
import * as restify from 'restify';
import { ConfigOptions, Connection, Query, WLError } from 'waterline';
import { Redis, RedisOptions } from 'ioredis';
import { Connection as TypeOrmConnection, ConnectionOptions } from 'typeorm';
import * as sequelize from 'sequelize';

export type DbInitCb = (err: Error, datastores: Connection[], collections: Query[], finale: () => void) => void;

export interface IOrmsIn {
    redis?: {
        skip: boolean;
        config?: RedisOptions | string;
    };
    sequelize?: {
        skip: boolean;
        uri?: string;
        config?: sequelize.Options;
    };
    typeorm?: {
        skip: boolean;
        config?: ConnectionOptions;
    };
    waterline?: {
        skip: boolean;
        config?: ConfigOptions;
    };
}

export interface IOrmsOut {
    redis?: {
        connection: Redis
    };
    sequelize?: {
        connection: sequelize.Sequelize
    };
    typeorm?: {
        connection: TypeOrmConnection
    };
    waterline?: {
        connection: Connection[],
        collections?: Query[]
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
    callback?: (err: Error | WLError, app?: restify.Server, orms_out?: IOrmsOut) => void;
}

export declare const tearDownRedisConnection: (connection: Redis, done: (error?: any) => any) => void;
export declare const tearDownTypeOrmConnection: (connection: TypeOrmConnection, done: (error?: any) => any) => void;
export declare const tearDownWaterlineConnection: (connections: Connection[], done: (error?: any) => any) => void;
export declare const tearDownConnections: (orms: IOrmsOut, done: (error?: any) => any) => void;

export declare const strapFramework: (kwargs: IStrapFramework) => void;
export declare const add_to_body_mw: (...updates: Array<[string, string]>) => restify.RequestHandler;
