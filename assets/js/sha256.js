async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

async function hashText() {
    const inputBox = document.getElementById('inputBox');
    const outputText = document.getElementById('outputText');

    if (inputBox.value.trim() === "") {
        outputText.textContent = "Please enter some text!";
        outputText.style.color = "red";
    } else {
        outputText.textContent = "Hashing...";
        outputText.style.color = "black";
        const hash = await sha256(inputBox.value);
        outputText.textContent = hash;
    }
}

async function displayText() { //await ?
    await hashText();
}