import express from 'express'
import 'dotenv/config'
import session from 'express-session'
import router from './routes/index.js'
import morgan from 'morgan'
import { Server } from 'socket.io'


const app = express()

// Heroku (and most PaaS) terminate TLS at the router; the request reaches the
// dyno over plain HTTP with x-forwarded-proto: https. Without this, req.secure
// is false, so session cookies configured `secure: true` are never set and the
// browser loses session state on every request.
app.set('trust proxy', 1)

const port = process.env.PORT || 8000

app.use('/public', express.static('public'))

app.use(express.urlencoded({ extended: false }))

app.use(express.json())

app.use(morgan('dev'))

app.use(
    session({
        secret: 'keyboard cat',
        resave: false,
        saveUninitialized: true,
        // 'auto' sets the secure flag only when req.secure is true. Combined
        // with trust proxy above, this means secure cookies on Heroku (HTTPS)
        // and plain cookies on localhost HTTP — both actually persist.
        cookie: { secure: 'auto' },
    })
)

app.use('/', router)

const server = app.listen(port, () => {
    console.log(`⚡️ [server]: Server is running at http://localhost:${port}`)
})

const io = new Server(server)

io.on('connection', (socket) => {
    console.log('connected')

    socket.on('disconnect', () => {
        console.log('disconnected')
    })
})

app.set('socketio', io);
