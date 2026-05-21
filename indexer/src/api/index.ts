import { db } from 'ponder:api'
import schema from 'ponder:schema'
import { graphql } from 'ponder'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()
app.use('*', cors({ origin: 'https://junoswap.trade' }))

app.use('/', graphql({ db, schema }))
app.use('/graphql', graphql({ db, schema }))

export default app
