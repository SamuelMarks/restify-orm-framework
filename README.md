restify-orm-framework
=======================

Utility functions for integrating waterline with restify; framework-style.

If using TypeScript, install `typings` with:

    typings install github:SamuelMarks/restify-orm-framework/restify-orm-framework.d.ts --save

Otherwise just use the [restify-orm-framework-dist](https://github.com/SamuelMarks/restify-orm-framework-dist) compiled output.

## Miscellaneous

Clone [restify-orm-framework-dist](https://github.com/SamuelMarks/restify-orm-framework-dist) one dir above where this repo was cloned, then synchronise with:

    find -type f -not -name "*.ts" -and -not -path "./.git/*" -and -not -path "./node-modules/*" -and -not -name '*.map' | cpio -pdamv ../restify-orm-framework-dist
