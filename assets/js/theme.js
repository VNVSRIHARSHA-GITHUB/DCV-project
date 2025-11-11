// assets/js/theme.js
// Simple theme toggler using localStorage. Shows ☀️ when in dark mode (so user can switch to light) and 🌙 when in light mode.

(function(){
  const root = document.documentElement;
  const stored = localStorage.getItem('phd_theme') || 'light';
  
  /**
   * Sets the theme (light or dark) on the document root and updates local storage.
   * @param {string} name 'light' or 'dark'.
   */
  function setTheme(name){
    if(name === 'dark') {
      root.setAttribute('data-theme','dark');
    } else {
      root.setAttribute('data-theme','light');
    }
    
    localStorage.setItem('phd_theme', name);
    
    // Select all theme icons across different pages (header, map, state)
    const icons = document.querySelectorAll('#themeIconHeader, #themeIconMap, #themeIconState');
    icons.forEach(i=> { 
        if(i) i.textContent = (name === 'dark') ? '☀️' : '🌙'; 
    });
    
    // Dispatch a custom event to notify maps/charts that the theme has changed
    // This allows maps and charts to re-render with new colors
    window.dispatchEvent(new Event('theme-change'));
  }
  
  /** Toggles the current theme. */
  function toggle(){ 
    const currentTheme = localStorage.getItem('phd_theme') || 'light';
    setTheme(currentTheme === 'dark' ? 'light' : 'dark'); 
  }

  // Set initial theme on load
  setTheme(stored);

  // Expose functions globally
  window.toggleTheme = toggle;
  window.setTheme = setTheme;

  // Global click listener to handle buttons on any page
  // We use event delegation on the document for simplicity
  document.addEventListener('click', (e)=>{
    if(!e.target) return;
    
    // Check if the clicked element (or its parent) is a theme toggle button
    const toggleButton = e.target.closest('#themeToggleHeader, #themeToggleMap, #themeToggleState');
    
    if (toggleButton) {
        toggle();
    }
  });
})();

