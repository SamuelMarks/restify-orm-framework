import * as restify from 'restify';
import {IModelRoute} from 'nodejs-utils';
import * as bunyan from 'bunyan';
import * as Waterline from 'waterline';
import {ConfigOptions, WLError} from 'waterline';
import {RedisClient} from 'redis';

declare var restify_utils: restify_utils.restify_utils;

declare module restify_utils {
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
        collections?: Waterline.Query[];
        waterline_config?: ConfigOptions;
        use_redis?: boolean;
        redis_cursors?: { redis: RedisClient };
        createSampleData?: boolean;
        SampleData?: any; //ISampleData,
        sampleDataToCreate?: (SampleData: any/*ISampleData*/) => Array<any>;
        //^ <T>(tasks: AsyncFunction<T>[], callback?: AsyncResultArrayCallback<T>) => void,
        callback?: (err: Error|WLError, app?: restify.Server, connections?: any[], collections?: Waterline.Query[]) => void;
    }

    export interface ISampleData {
        constructor(url: string): ISampleData|any;
        token?: string;
    }
}

export = restify_utils;