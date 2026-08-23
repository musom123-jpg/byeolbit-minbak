const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
  navbar.style.boxShadow = window.scrollY > 10 ? '0 2px 12px rgba(0,0,0,0.25)' : 'none';
});
