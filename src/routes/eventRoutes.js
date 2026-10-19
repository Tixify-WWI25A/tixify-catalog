const { buildRouter } = require('./buildRouter');
const { admin } = require('../middleware/auth');

const routes = [
  ['get',    '/',    'GetEventsHandler'],
  ['get',    '/:id', 'GetEventByIdHandler'],
  ['post',   '/',    'CreateEventHandler', admin],
  ['patch',  '/:id', 'UpdateEventHandler', admin],
  ['delete', '/:id', 'DeleteEventHandler', admin]
];

module.exports = { routes, router: buildRouter(routes) };
