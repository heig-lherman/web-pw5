class ServerError {
    constructor(error, reason) {
        this.error = error;
        this.reason = reason;
    }
}

export function userNotInConversationError() {
    return new ServerError(
        "Operation not permitted",
        "Conversation not found"
    )
}

export function conversationNotFoundError() {
    return new ServerError(
        "Operation not permitted",
        "Conversation not found"
    )
}

export function emptyMessageError() {
    return new ServerError(
        "Operation not permitted",
        "Message is empty"
    )
}