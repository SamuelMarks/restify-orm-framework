import * as restify from 'restify';
import { IModelRoute } from 'nodejs-utils';
import * as bunyan from 'bunyan';
import { ConfigOptions, Connection, Query, WLError } from 'waterline';
import { RedisClient } from 'redis';
import { Server } from 'restify';

declare const restify_utils: restify_utils.restify_utils;

/* tslint:disable:no-namespace no-internal-module */
declare module restify_utils {
    /* tslint:disable:interface-name class-name */
    export interface restify_utils {
        strapFramework(kwargs: IStrapFramework);
        add_to_body_mw(...updates: Array<[string, string]>): restify.RequestHandler;
    }

    export interface IStrapFramework {
        app_name: string;
        models_and_routes: IModelRoute;
        logger: bunyan;
        _cache: {};
        package_: {version: number};
        root?: string;
        app_logging?: boolean;
        start_app?: boolean;
        skip_db?: boolean;
        collections?: Query[];
        waterline_config?: ConfigOptions;
        use_redis?: boolean;
        redis_cursors?: {redis: RedisClient};
        onServerStart?: (uri: string, connections: Connection[], collections: Query[], app: Server, next) => void;
        callback?: (err: Error | WLError, app?: restify.Server,
                    connections?: Connection[], collections?: Query[]) => void;
    }
}

export = restify_utils;
