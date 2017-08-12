restify-orm-framework
=====================

Utility functions for integrating ORMs with restify; framework-style.

If using TypeScript, install `typings` with:

    typings install github:SamuelMarks/restify-orm-framework/restify-orm-framework.d.ts --save

Otherwise just use the [restify-orm-framework-dist](https://github.com/SamuelMarks/restify-orm-framework-dist) compiled output.

## Supports

 - [Sequelize](https://github.com/sequelize/sequelize)
 - [TypeORM](https://github.com/typeorm/typeorm)
 - [Waterline](https://github.com/balderdashy/waterline)

## Idea

Have this directory structure:

    ── main.[js|ts]
    ── api
    │   ├── auth
    │   │   ├── middleware.[js|ts]
    │   │   ├── models.[js|ts]
    │   │   └── routes.[js|ts]
    │   └── user
    │       ├── models.[js|ts]
    │       ├── routes.[js|ts]
    │       └── utils.[js|ts]

Where the main file doesn't import any models or routes explicitly.

Models, routes and tests can be cleanly isolated also.

Example: [restify-orm-scaffold](https://github.com/SamuelMarks/restify-orm-scaffold)

## Miscellaneous

Clone [restify-orm-framework-dist](https://github.com/SamuelMarks/restify-orm-framework-dist) one dir above where this repo was cloned, then synchronise with:

    find -type f -not -name "*.ts" -and -not -path "./.git/*" -and -not -path "./node-modules/*" -and -not -name '*.map' | cpio -pdamv ../restify-orm-framework-dist
