import express from 'express'
import session from 'express-session'
import { WorkOS } from '@workos-inc/node'


const app = express()
const router = express.Router()

app.use(
    session({
        secret: 'keyboard cat',
        resave: false,
        saveUninitialized: true,
        cookie: { secure: true },
    })
)

const workos = new WorkOS(process.env.WORKOS_API_KEY)
const connectionID = process.env.WORKOS_CONNECTION_ID
const clientID = process.env.WORKOS_CLIENT_ID
const organizationID = 'org_01KPH4P3MKHP42EFZE2XKQNZNC'
const redirectURI = `${process.env.HOST_URL}/callback`
const state = ''

router.get('/', function (req, res) {
    if (session.isloggedin) {
        res.render('login_successful.ejs', {
            profile: session.profile,
            first_name: session.first_name,
        })
    } else {
        res.render('index.ejs', { title: 'Home' })
    }
})

router.post('/login', (req, res) => {
    const login_type = req.body.login_method

    const params = {
        connection: connectionID,
        clientID: clientID,
        redirectURI: redirectURI,
        state: state,
    }

    if (login_type === 'saml') {
        params.organization = organizationID
    } else {
        params.provider = login_type
    }

    try {
        const url = workos.sso.getAuthorizationURL(params)

        res.redirect(url)
    } catch (error) {
        res.render('error.ejs', { error: error })
    }
})

router.get('/callback', async (req, res) => {
    console.log(req)
    let errorMessage
    try {
        const { code, error } = req.query

        if (error) {
            errorMessage = `Redirect callback error: ${error}`
        } else {
            const profile = await workos.sso.getProfileAndToken({
                code,
                clientID,
            })
            const json_profile = JSON.stringify(profile, null, 4)

            session.first_name = profile.profile.first_name
            session.profile = json_profile
            session.isloggedin = true
        }
    } catch (error) {
        errorMessage = `Error exchanging code for profile: ${error}`
    }

    if (errorMessage) {
        res.render('error.ejs', { 
            error: errorMessage,
            errorDescription: req.query.error_description
         })
    } else {
        res.redirect('/')
    }
})

router.get('/logout', async (req, res) => {
    try {
        session.first_name = null
        session.profile = null
        session.isloggedin = null

        res.redirect('/')
    } catch (error) {
        res.render('error.ejs', { error: error })
    }
})

router.get('/directories', async (req, res) => {
    let before = req.query.before
    let after = req.query.after
    const directories = await workos.directorySync.listDirectories({
        limit: 5,
        before: before,
        after: after,
        order: null,
    })
    console.log("DIRECORIES")
    console.log(directories)

    before = directories.listMetadata.before
    after = directories.listMetadata.after

    res.render('directories.ejs', {
        title: 'Home',
        directories: directories.data,
        before: before,
        after: after,
    })
})

router.get('/directory', async (req, res) => {
    const directories = await workos.directorySync.listDirectories()
    const directory = directories.data.filter((directory) => {
        return directory.id == req.query.id
    })[0]
    res.render('directory.ejs', {
        directory: directory,
        title: 'Directory',
    })
})

router.get('/users', async (req, res) => {
    const directoryId = req.query.id
    const users = await workos.directorySync.listUsers({
        directory: directoryId,
        limit: 100,
    })
    res.render('users.ejs', { users: users.data })
})

router.get('/groups', async (req, res) => {
    const directoryId = req.query.id
    const groups = await workos.directorySync.listGroups({
        directory: directoryId,
        limit: 100,
    })
    res.render('groups.ejs', { groups: groups.data })
})

router.post('/webhooks', async (req, res) => {
    const webhook = workos.webhooks.constructEvent({
        payload: req.body,
        sigHeader: req.headers['workos-signature'],
        secret: process.env.WORKOS_WEBHOOK_SECRET,
        tolerance: 90000,
    })
    io.emit('webhook event', { webhook })

    res.sendStatus(200)
})

router.get('/webhooks', async (req, res) => {
    res.render('webhooks.ejs', {
        title: 'Webhooks',
    })
})


export default router
