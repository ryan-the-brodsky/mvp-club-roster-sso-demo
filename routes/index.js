import express from 'express'
import { WorkOS } from '@workos-inc/node'


const router = express.Router()

const workos = new WorkOS(process.env.WORKOS_API_KEY)
const connectionID = process.env.WORKOS_CONNECTION_ID
const clientID = process.env.WORKOS_CLIENT_ID
const organizationID = 'org_01KPH4P3MKHP42EFZE2XKQNZNC'
const redirectURI = `${process.env.HOST_URL}/callback`
const state = ''

// Render the satirical error page. If the error object carries common API-error
// metadata (status / requestID / code), surface it in the description slot.
// `extraDescription` lets callers pass in additional context — e.g. the
// `error_description` query param from an OAuth callback.
function renderError(res, error, extraDescription) {
    const parts = []
    if (error?.status) parts.push(`status ${error.status}`)
    if (error?.requestID) parts.push(`request ${error.requestID}`)
    if (error?.code) parts.push(`code ${error.code}`)
    const errorMeta = parts.join(' · ')

    let errorDescription
    if (extraDescription && errorMeta) errorDescription = `${extraDescription} — ${errorMeta}`
    else if (extraDescription) errorDescription = extraDescription
    else if (errorMeta) errorDescription = errorMeta

    res.render('error.ejs', { error, errorDescription })
}

// Gate for pages that require an authenticated session. Unauthenticated
// requests are bounced to /, which renders the landing page.
function requireAuth(req, res, next) {
    if (req.session?.isloggedin) return next()
    res.redirect('/')
}

router.get('/', function (req, res) {
    if (req.session.isloggedin) {
        res.render('login_successful.ejs', {
            profile: req.session.profile,
            first_name: req.session.first_name,
        })
    } else {
        res.render('index.ejs', { title: 'Home' })
    }
})

router.post('/login', (req, res) => {
    try {
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

        const url = workos.sso.getAuthorizationURL(params)
        res.redirect(url)
    } catch (error) {
        renderError(res, error)
    }
})

router.get('/callback', async (req, res) => {
    try {
        const { code, error } = req.query
        if (error) {
            return renderError(res,
                `Redirect callback error: ${error}`,
                req.query.error_description
            )
        }
        const profile = await workos.sso.getProfileAndToken({ code, clientID })
        req.session.first_name = profile.profile.first_name
        req.session.profile = JSON.stringify(profile, null, 4)
        req.session.isloggedin = true
        res.redirect('/')
    } catch (error) {
        renderError(res, error, req.query.error_description)
    }
})

router.get('/logout', async (req, res) => {
    try {
        req.session.first_name = null
        req.session.profile = null
        req.session.isloggedin = null

        res.redirect('/')
    } catch (error) {
        renderError(res, error)
    }
})

router.get('/directories', requireAuth, async (req, res) => {
    try {
        let before = req.query.before
        let after = req.query.after
        const directories = await workos.directorySync.listDirectories({
            limit: 5,
            before: before,
            after: after,
            order: null,
        })

        before = directories.listMetadata.before
        after = directories.listMetadata.after

        res.render('directories.ejs', {
            title: 'Home',
            directories: directories.data,
            before: before,
            after: after,
        })
    } catch (error) {
        renderError(res, error)
    }
})

router.get('/directory', requireAuth, async (req, res) => {
    try {
        const directories = await workos.directorySync.listDirectories()
        const directory = directories.data.filter((directory) => {
            return directory.id == req.query.id
        })[0]
        if (!directory) {
            return renderError(res,
                `Jurisdiction ${req.query.id} was not found. The Panopticon knows no such place.`
            )
        }
        res.render('directory.ejs', {
            directory: directory,
            title: 'Directory',
        })
    } catch (error) {
        renderError(res, error)
    }
})

router.get('/users', requireAuth, async (req, res) => {
    try {
        let directoryId = req.query.id
        if (!directoryId) {
            const firstDirectory = await workos.directorySync.listDirectories({ limit: 1 })
            directoryId = firstDirectory.data[0]?.id
        }
        if (!directoryId) {
            return res.render('users.ejs', { users: [] })
        }
        const users = await workos.directorySync.listUsers({
            directory: directoryId,
            limit: 100,
        })
        res.render('users.ejs', { users: users.data })
    } catch (error) {
        renderError(res, error)
    }
})

router.get('/groups', requireAuth, async (req, res) => {
    try {
        const directoryId = req.query.id
        const groups = await workos.directorySync.listGroups({
            directory: directoryId,
            limit: 100,
        })
        res.render('groups.ejs', { groups: groups.data })
    } catch (error) {
        renderError(res, error)
    }
})

router.post('/webhooks', async (req, res) => {
    try {
        const webhook = workos.webhooks.constructEvent({
            payload: req.body,
            sigHeader: req.headers['workos-signature'],
            secret: process.env.WORKOS_WEBHOOK_SECRET,
            tolerance: 90000,
        })
        const io = req.app.get('socketio')
        io.emit('webhook event', { webhook })

        res.sendStatus(200)
    } catch (error) {
        // WorkOS expects a status code here, not HTML. 400 signals a bad
        // signature or malformed payload; it retries on 5xx, so prefer 400
        // unless we're sure it's transient.
        console.error('[webhooks] verification failed:', error)
        res.sendStatus(400)
    }
})

router.get('/webhooks', requireAuth, async (req, res) => {
    try {
        res.render('webhooks.ejs', {
            title: 'Webhooks',
        })
    } catch (error) {
        renderError(res, error)
    }
})


export default router
