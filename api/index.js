'use strict';
// Vercel Serverless entrypoint — wraps the Express app
// Le scheduler (node-cron) est desactive en mode serverless,
// le cache est rafraichi via le cron Vercel defini dans vercel.json.

process.env.VERCEL = '1';

const app = require('../sentinel/server/app');

module.exports = app;
