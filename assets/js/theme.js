(function(){
  const root = document.documentElement;
  const stored = localStorage.getItem('phd_theme') || 'light';
  setTheme(stored);

  function setTheme(name){
    if(name === 'dark') root.setAttribute('data-theme','dark');
    else root.removeAttribute('data-theme');
    localStorage.setItem('phd_theme', name);
    const icons = document.querySelectorAll('#themeIconHeader,#themeIconMap,#themeIconState');
    icons.forEach(i=> { if(i) i.className = name === 'dark' ? 'fa fa-sun' : 'fa fa-moon'; });
  }
  function toggle(){ setTheme(localStorage.getItem('phd_theme') === 'dark' ? 'light' : 'dark'); }

  window.toggleTheme = toggle;
  window.setTheme = setTheme;

  document.addEventListener('click', (e)=>{
    if(!e.target) return;
    if(e.target.id === 'themeToggleHeader' || e.target.id === 'themeIconHeader') toggle();
    if(e.target.id === 'themeToggleMap' || e.target.id === 'themeIconMap') toggle();
    if(e.target.id === 'themeToggleState' || e.target.id === 'themeIconState') toggle();
  });
})();
