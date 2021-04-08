customElements.whenDefined('hui-view').then(() => {

    const haButtonMenu = document.querySelector('home-assistant').shadowRoot
        .querySelector('home-assistant-main').shadowRoot
        .querySelector('ha-panel-lovelace').shadowRoot
        .querySelector('hui-root').shadowRoot
        .querySelector('ha-button-menu');

    haButtonMenu.updateComplete.then(() => {

        function haClock() {
            c.innerHTML = (new Date()).toLocaleString(navigator.language, { 
				weekday: 'long', 
				month: 'long', 
				day: 'numeric', 
				hour: 'numeric', 
				minute: '2-digit' 
            });
}

        const mdcButton = haButtonMenu.querySelector('mwc-icon-button').shadowRoot
            .querySelector('button')

        const haMenuSpan = haButtonMenu.querySelector('mwc-icon-button').shadowRoot
            .querySelector('span')

        // Adjust the CSS
        mdcButton.style.height = 'auto';
        mdcButton.style.width = 'auto';
        mdcButton.style.padding = '0px';

        // Insert the clock
        var c = document.createElement('span');
        haMenuSpan.parentNode.replaceChild(c, haMenuSpan);
		
		

        // Start the clock
        haClock();
        setInterval(function() {
            haClock();
        }, 1000);
    });
})