// theme.js - consistent theme toggling across pages using data-theme attr
(function(){
    const root = document.documentElement;
    const stored = localStorage.getItem('phd_theme') || 'light';
    setTheme(stored);
  
    // called from buttons with IDs themeToggleHeader, themeToggleMap, themeToggleState
    function setTheme(name){
      if(name === 'dark'){
        root.setAttribute('data-theme','dark');
      } else {
        root.removeAttribute('data-theme');
      }
      localStorage.setItem('phd_theme', name);
      // update icons if present
      const icons = document.querySelectorAll('#themeIconHeader, #themeIconMap, #themeIconState');
      icons.forEach(i => {
        if(i) i.className = name === 'dark' ? 'fa fa-sun' : 'fa fa-moon';
      });
    }
  
    function toggle(){
      const current = localStorage.getItem('phd_theme') === 'dark' ? 'dark' : 'light';
      setTheme(current === 'dark' ? 'light' : 'dark');
    }
  
    window.toggleTheme = toggle;
    window.setTheme = setTheme;
  
    // bind any present buttons
    document.addEventListener('click', (e)=>{
      if(!e.target) return;
      if(e.target.id === 'themeToggleHeader' || e.target.id === 'themeIconHeader') toggle();
      if(e.target.id === 'themeToggleMap' || e.target.id === 'themeIconMap') toggle();
      if(e.target.id === 'themeToggleState' || e.target.id === 'themeIconState') toggle();
    });
  
  })();
  