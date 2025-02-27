console.log("Script.js running")
document.addEventListener('DOMContentLoaded', function () {
    const alertBox = document.getElementById('alertBox');
    if (alertBox) {
        setTimeout(() => {
            alertBox.classList.remove('show');
            alertBox.addEventListener('transitionend', () => alertBox.remove());
        }, 4500);
    }
});

function adjustFooter() {
    const footer = document.querySelector('.footer1');
    const contentHeight = document.body.offsetHeight + footer.clientHeight; // Total content height
    const viewportHeight = window.innerHeight; // Viewport height

    if (contentHeight <= viewportHeight) {
        footer.style.position = 'absolute';
        footer.style.bottom = '0';
    } else {
        footer.style.position = 'static';
    }
}

['load', 'resize', 'change'].forEach(event => {
    window.addEventListener(event, adjustFooter);
});

function showAlert(isGreen, message, callback) {
    const alertBox = document.getElementById('customAlert');
    const alertMessage = document.getElementById('alertMessage');
    const okBtn = document.getElementById("okButton");

    alertMessage.textContent = message;

    if (isGreen) {
        alertBox.classList.remove('alert-red');
        okBtn.classList.remove('alert-red');
        okBtn.classList.add('alert-green');

        alertBox.classList.add('alert-green');
    } else {
        alertBox.classList.remove('alert-green');
        okBtn.classList.remove('alert-green');

        okBtn.classList.add('alert-red');
        alertBox.classList.add('alert-red');
    }

    okBtn.onclick = function() {
        closeAlert();
        if (callback) {
            callback();
        }
    };

    alertBox.style.display = 'block';
}

function closeAlert() {
    const alertBox = document.getElementById('customAlert');
    alertBox.style.display = 'none';
}
