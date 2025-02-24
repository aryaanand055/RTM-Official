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
