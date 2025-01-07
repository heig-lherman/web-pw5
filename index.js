import app from './server.js'
import { port } from './constants.js'

console.log("Starting server...")

app.listen(port, () => {
    console.log(`Listening on port ${port}`)
})