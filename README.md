restify-utils
=============

Custom validators for the Node.JS restify framework.

If using TypeScript, install `typings` with:

    typings install github:SamuelMarks/restify-utils/restify-utils.d.ts --save

Otherwise just use the [restify-utils-dist](https://github.com/SamuelMarks/restify-utils-dist) compiled output.

## Miscellaneous

Clone [restify-utils-dist](https://github.com/SamuelMarks/restify-utils-dist) one dir above where this repo was cloned, then synchronise with:

    find -type f -not -name "*.ts" -and -not -path "./.git/*" -and -not -path "./node-modules/*" -and -not -name '*.map' | cpio -pdamv ../restify-utils-dist
