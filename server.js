import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { EventEmitter } from 'events';
import { getUserByName, getConversationById, Message, Conversation, User } from './data.js';
import { conversationNotFoundError, emptyMessageError, userNotInConversationError } from './errors.js';
import sanitize from 'sanitize-html';
import passport from 'passport';
import LocalStrategy from 'passport-local';
import { hash, verify } from 'argon2';

const app = express();

let emitter = new EventEmitter()

// Configure express
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Frontend
app.set('view engine', 'ejs');
app.use(express.static('public'));

// Session storage
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
}))

// Local auth
const fakeHash = await hash("fake");
const verifyPassword = async (user, password) => {
    if (!user) {
        // Fake verification to prevent timing attacks
        await verify(fakeHash, password);
        return false;
    } else {
        return await verify(user.password, password);
    }
}

passport.use(
    new LocalStrategy(
        async (username, password, done) => {
            try {
                const user = await getUserByName(username);
                if (await verifyPassword(user, password)) {
                    return done(null, user);
                }

                return done(null, false, { message: 'Login failed' });
            } catch (err) {
                console.error(err);
                return done(new Error("Login failed"));
            }
        }
    )
)

passport.serializeUser((user, done) => {
    done(null, user.username);
})

passport.deserializeUser(async (id, done) => {
    try {
        const user = await getUserByName(id);
        done(null, user);
    } catch (err) {
        done(err);
    }
})

app.use(passport.initialize());
app.use(passport.session());

// Log all requests to console
app.use('/', (req, res, next) => {
    console.log("Request for " + req.originalUrl);
    next()
})

// Handle browser trying to fetch favicon
app.get('/favicon.ico', (req, res) => res.status(204));

// Serve login page
app.get('/login', (req, res) => {
    let username = req.cookies.username
    let errorMessage = req.query.error
    res.render('login', { username, errorMessage });
})

// Extract username and password from login request
app.post('/login', passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: `/login?error=${encodeURIComponent("Invalid username or password")}`,
}))

// Redirecting any request to /login if auth failed
app.use((req, res, next) => {
    console.log(`Checking if user is logged in, otherwise redirect`)
    if (!req.isAuthenticated()) {
        res.redirect("/login?error=" + encodeURIComponent("You need to login first"))
        return
    }

    next()
})

// Handle logout
app.all('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error(err);
            return next("Logout failed");
        }

        req.session.destroy(() => {
            res.clearCookie('connect.sid', { path: '/' });
            res.redirect('/login');
        })
    });
})


// SSE notifications of new messages
app.get("/notifications", (req, res) => {
    let user = req.user;
    console.log(`Received notifications request from ${user.username}`);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const onMessage = (message) => {
        console.log(`event emission received, sending notification to ${user.username}`);
        res.write(`data: ${JSON.stringify(message)}\n\n`);
    };

    emitter.addListener("message::" + user.id, onMessage);

    console.log(`Listeners for ${user.username}: ${emitter.listenerCount("message::" + user.id)}`);

    req.on("close", () => {
        console.log(`Notification connection closed for ${user.username}`);
        emitter.removeListener("message::" + user.id, onMessage);
    });
});

function convertConvsForRender(user) {
    return user.getConversations()
        .then((conversations) => Promise.all(conversations.map(async (conversation) => {
            let other = await conversation.getOtherUser(user);
            let lastMessage = await conversation.getLastMessage();
            return {
                uid: conversation.id,
                otherUser: other,
                lastMessage: lastMessage,
            }
        })));
}

// Serve index page
app.get('/', async (req, res) => {
    let user = req.user;
    let conversations = await convertConvsForRender(user)

    res.render('index', { currentUser: user, conversations, mainConvUid: undefined, mainConvMessages: [] });
});

// Conversation authorization middleware
app.use('/conversation/:conversationId', async (req, res, next) => {
    let user = req.user;
    getConversationById(req.params.conversationId).then(
        (conversation) => {
            if (!conversation.hasUser(user)) {
                console.log(`Trying to get another user's conversation. Requester is ${user.username} (${user.id}))`)
                res.status(403).json(userNotInConversationError())
                return
            }

            req.conversation = conversation;
            next();
        },
        () => {
            res.status(404).send(conversationNotFoundError());
        }
    )
});

// Getting a full conversation
app.get("/conversation/:conversationId", async (req, res) => {
    let user = req.user
    let mainConvMessages = await req.conversation.getMessages()
    let mainConvUid = req.conversation.id
    let conversations = await convertConvsForRender(user)

    res.render('index', { currentUser: user, conversations, mainConvUid, mainConvMessages })
})

// Posting a message
app.post("/conversation/:conversationId", async (req, res) => {
    let user = req.user
    let mainConversation = req.conversation
    let message = sanitize(req.body.message, {
        allowedTags: [],
        allowedAttributes: {}
    });

    const other = await mainConversation.getOtherUser(user)

    if (message.length == 0) {
        res.status(403).json(emptyMessageError())

        return
    }

    // Wait for a second, to avoid spamming if they manage to create a loop.
    await new Promise(resolve => setTimeout(resolve, 500));

    await mainConversation.addMessage(user.id, message);

    emitter.emit("message::" + user.id, [{ conversationId: mainConversation.id, fromMe: true, message }]);
    emitter.emit("message::" + other.id, [{ conversationId: mainConversation.id, fromMe: false, message }]);

    res.status(200).send("Message sent")
})

// Allow clearing all conversations
app.get("/clear", async (req, res) => {
    let user = req.user

    await user.clearAllConversations();

    for (let conv of await user.getConversations()) {
        let other = await conv.getOtherUser(user);
        emitter.emit("message::" + other.id, {});
    }

    res.redirect("/")
})

// Allow changing display name
app.post("/displayname", (req, res) => {
    let user = req.user
    let displayName = req.body.displayName;
    if (!displayName || !displayName.match(/^[a-zA-Z0-9_-\s]+$/)) {
        res.status(400).send("Invalid display name provided")
        return
    }
    console.log(`Asked to change display name to ${displayName}`)
    user.changeDisplayName(displayName);
    emitter.emit("message::" + user.id, {});

    res.redirect("/")
})

export default app;
