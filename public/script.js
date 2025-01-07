function openChat(convUid) {
    window.location = '/conversation/' + convUid;
}

function showChangeDisplayName() {
    document.getElementById('changeNameDialog').setAttribute('open', true);
}

function changeDisplayName() {
    let name = document.getElementById('newDisplayName').value;
    name = name.trim();
    if (name.length == 0) {
        console.log("Name is empty; not changing");
        return;
    }

    fetch('/displayname', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ displayName: name })
    })
        .then((response) => {
            window.location.reload();
        })
        .catch((error) => console.log(error));
}

function getConversationIdFromUrl() {
    const path = window.location.pathname;
    const match = path.match(/\/conversation\/(\w+)/);
    if (match) {
        return match[1];
    }
    return null;
}

function getNotifications() {
    console.log("Getting notifications...");
    const eventSource = new EventSource('/notifications');

    eventSource.onmessage = function (event) {
        console.log("Received notification:", event.data);
        let conversationId = getConversationIdFromUrl();

        let data = JSON.parse(event.data);
        if (!(data instanceof Array) || !conversationId) {
            window.location.reload();
            return;
        }
        for (let message of data) {
            if (message.conversationId == conversationId) {
                const messageElement = document.createElement('div');
                messageElement.classList.add('message');
                const innerSpan = document.createElement('span');
                innerSpan.innerHTML = message.message;
                messageElement.appendChild(innerSpan);

                // Check if the message is from the current user
                if (message.fromMe) {
                    messageElement.classList.add('sent');
                }

                // Append the message element to the messages container
                document.querySelector('.messages').appendChild(messageElement);
            }
            document.getElementById(`conversation${message.conversationId}`).querySelector('.last-message').textContent = message.message;
        }

        // Scroll to the last message
        document.querySelector('.message:last-child')?.scrollIntoView();
    };

    eventSource.onerror = function (error) {
        console.log("Error occurred:", error);
        eventSource.close();
    };
}

// Executed when the button in the form is clicked
function submitForm(event, convUid) {
    event.preventDefault();

    let message = document.getElementById('message').value.trim();

    fetch(`/conversation/${convUid}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message })
    })
        .catch((error) => console.log(error))
}

window.onload = () => {
    if (!window.location.pathname.includes('login')) {
        getNotifications()
        document.querySelector('.message:last-child')?.scrollIntoView()
    }
}
