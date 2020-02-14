<template>
  <div class="menu-bar">
    <a @click="switchToShow">
      <i class="fas fa-bars"></i>
    </a>
  </div>
</template>

<script>
export default {
  methods: {
    switchToShow(e) {
      let menu = document.getElementById('menu')

      if (menu.className === 'show') {
        menu.className = 'hide'
      } else {
        menu.className = 'show'
      }
    }
  }
}
</script>
