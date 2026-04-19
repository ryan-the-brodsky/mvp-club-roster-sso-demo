import express from 'express'
import 'dotenv/config'
import router from './routes/index.js'
import morgan from 'morgan'
import { Server } from 'socket.io'


const app = express()

const port = process.env.PORT || 8000

app.use('/public', express.static('public'))

app.use(express.urlencoded({ extended: false }))

app.use(express.json())

app.use(morgan('dev'))

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
