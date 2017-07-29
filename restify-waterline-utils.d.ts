import * as restify from 'restify';
import { Server } from 'restify';
import * as bunyan from 'bunyan';
import { ConfigOptions, Connection, Query, WLError } from 'waterline';
import { Redis, RedisOptions } from 'ioredis';

export type DbInitCb = (err: Error, datastores: Connection[], collections: Query[], finale: () => void) => void;

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
    start_app?: boolean;
    skip_db?: boolean;
    collections?: Query[];
    waterline_config?: ConfigOptions;
    redis_config?: RedisOptions;
    use_redis?: boolean;
    redis_cursors?: {redis: Redis};
    listen_port?: number;
    onServerStart?: (uri: string, datastores: Connection[], collections: Query[], app: Server, next) => void;
    onDbInitCb?: DbInitCb;
    onDbInit?: (app: Server, datastores: Connection[], collections: Query[],
                finale: () => void, next: DbInitCb) => void;
    createServerArgs?: restify.ServerOptions;
    callback?: (err: Error | WLError, app?: restify.Server,
                datastores?: Connection[], collections?: Query[]) => void;
}

export declare const strapFramework: (kwargs: IStrapFramework) => void;
export declare const add_to_body_mw: (...updates: Array<[string, string]>) => restify.RequestHandler;
