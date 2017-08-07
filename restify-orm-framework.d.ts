import * as bunyan from 'bunyan';
import * as restify from 'restify';
import { Server } from 'restify';
import { ConfigOptions, Connection, Query, WLError } from 'waterline';
import { Redis, RedisOptions } from 'ioredis';
import { Connection as TypeOrmConnection, ConnectionOptions } from 'typeorm';

export type DbInitCb = (
    err: Error, datastores: Connection[], collections: Query[], finale: () => void
) => void;

export interface IStrapFramework {
    app_name: string;
    models_and_routes: Map<string, {
        create?: restify.RequestHandler, read?: restify.RequestHandler,
        update?: restify.RequestHandler, del?: restify.RequestHandler
    } | {} | any> | {}; // ^ Could have more than CRUD, but this is better than `any` or `{}`
    logger: bunyan;
    _cache: {};
    package_: {version: number};
    root?: string;
    app_logging?: boolean;
    skip_start_app?: boolean;
    skip_waterline?: boolean;
    collections?: Query[];
    waterline_config?: ConfigOptions;
    redis_config?: RedisOptions | string;
    skip_redis?: boolean;
    redis_cursors?: {redis: Redis};
    skip_typeorm?: boolean;
    typeorm_config?: ConnectionOptions;
    listen_port?: number;
    onServerStart?: (uri: string, datastores: Connection[], collections: Query[],
                     connection: TypeOrmConnection, app: Server, next) => void;
    onDbInitCb?: DbInitCb;
    onDbInit?: (app: Server, datastores: Connection[], collections: Query[],
                finale: () => void, next: DbInitCb) => void;
    createServerArgs?: restify.ServerOptions;
    // E.g.: for testing:
    callback?: (err: Error | WLError, app?: restify.Server,
                datastores?: Connection[], collections?: Query[],
                connection?: TypeOrmConnection) => void;
}

export declare const strapFramework: (kwargs: IStrapFramework) => void;
export declare const add_to_body_mw: (...updates: Array<[string, string]>) => restify.RequestHandler;
