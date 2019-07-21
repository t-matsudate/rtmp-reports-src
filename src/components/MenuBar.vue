<template>
  <div class="menu-bar">
    <a @click="slideSideMenu">
      <i class="fas fa-bars"></i>
    </a>
  </div>
</template>

<script>
export default {
    name: 'MenuBar',
    methods: {
        slideSideMenu: function() {
            let menu = document.getElementById("menu");

            if (menu.getAttribute("class") == "hidden") {
                menu.setAttribute("class", "shown");
            } else if (menu.getAttribute("class") == "shown") {
                menu.setAttribute("class", "hidden");
            } else {
                return;
            }
        }
    }
}
</script>
