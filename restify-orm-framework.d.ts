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

    skip_app_logging?: boolean;
    skip_start_app?: boolean;
    skip_waterline?: boolean;
    skip_redis?: boolean;
    skip_typeorm?: boolean;

    waterline_collections?: Query[];
    waterline_config?: ConfigOptions;
    redis_config?: RedisOptions | string;
    redis_cursors?: {redis: Redis};
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
                datastores?: Connection[], waterline_collections?: Query[],
                typeorm_connection?: TypeOrmConnection) => void;
}

export declare const strapFramework: (kwargs: IStrapFramework) => void;
export declare const add_to_body_mw: (...updates: Array<[string, string]>) => restify.RequestHandler;
