import * as restify from 'restify';
import {IModelRoute} from 'nodejs-utils';
import {Logger} from 'bunyan';
import * as Waterline from 'waterline';
import {ConfigOptions} from 'waterline';
import {RedisClient} from 'redis';

declare var restify_utils: restify_utils.restify_utils;

declare module restify_utils {
    export interface restify_utils {
        strapFramework(kwargs: IStrapFramework)
    }

    export interface IStrapFramework {
        models_and_routes: IModelRoute,
        logger: Logger,
        _cache: {},
        package_: {version: number},
        root?: string,
        start_app?: boolean,
        skip_db?: boolean,
        collections?: Waterline.Query[],
        waterline_config?: ConfigOptions,
        use_redis?: boolean,
        redis_cursors?: { redis: RedisClient },
        createSampleData?: boolean,
        SampleData?: any, //ISampleData,
        sampleDataToCreate?: (SampleData: any/*ISampleData*/) => Array<any>,
        //^ <T>(tasks: AsyncFunction<T>[], callback?: AsyncResultArrayCallback<T>) => void,
        callback?: (app: restify.Server, connections?: any[], collections?: Waterline.Query[]) => void
    }

    export interface ISampleData {
        constructor(url: string): ISampleData|any;
        token?: string;
    }
}

export = restify_utils;