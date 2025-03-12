console.log("Script.js running")

// Custom alert box
document.addEventListener('DOMContentLoaded', function () {
    const alertBox = document.getElementById('alertBox');
    const closeButton = document.getElementById('closeAlert');

    if (alertBox) {
        alertBox.style.animation = "fadeSlideIn 0.4s ease-out";

        const timeout = setTimeout(() => {
            alertBox.style.animation = "fadeSlideOut 0.4s ease-in";
            setTimeout(() => alertBox.remove(), 400);
        }, 45000);

        closeButton.addEventListener('click', () => {
            clearTimeout(timeout);
            alertBox.style.animation = "fadeSlideOut 0.4s ease-in";
            setTimeout(() => alertBox.remove(), 400);
        });
    }
});

// Adjust footer based on screen size
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

// Custom alert after form submit
function showAlert(color, message, callback) {
    const customAlertBox = document.getElementById('customAlert');
    const alertMessage = document.getElementById('alertMessage');
    const okBtn = document.getElementById("okButton");

    alertMessage.textContent = message;
    okBtn.classList.add(`alert-${color}`);
    customAlertBox.classList.add(`alert-${color}`);

    okBtn.onclick = function () {
        closeAlert();
        if (callback) {
            callback();
        }
    };

    customAlertBox.style.display = 'block';
}

function closeAlert() {
    const customAlertBox = document.getElementById('customAlert');
    customAlertBox.style.display = 'none';
}

// To enable tooltips
function enableTooltip() {
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
    })
}
document.addEventListener('DOMContentLoaded', function () {
    enableTooltip()
})


// Custom navbar
