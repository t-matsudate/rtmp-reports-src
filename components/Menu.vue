<template>
  <div id="menu" class="hide">
    <MenuBar />
    <div id="menu-list">
      <nav>
        <ul>
          <li><a href="https://t-matsudate.github.io">Back to Portfolio</a></li>
          <li><nuxt-link to="/">目次</nuxt-link></li>
          <li><nuxt-link to="/articles/overview">RTMP の概要</nuxt-link></li>
          <li><nuxt-link to="/articles/connection-implementation">ハンドシェイクと Invoke 処理の実装</nuxt-link></li>
        </ul>
      </nav>
    </div>
  </div>
</template>

<script>
import MenuBar from './MenuBar.vue'

export default {
  components: {
    MenuBar
  },
  methods: {
    slideSideMenu(e) {
      if (e.clientX > (window.innerWidth / 2)) {
        document.getElementById('menu').className = 'hide'
      }
    }
  },
  mounted() {
    window.addEventListener('click', this.slideSideMenu)
  },
  destroyed() {
    window.removeEventListener('click', this.slideSideMenu)
  }
}
</script>

<style lang="less">
@import "~assets/less/menu";
</style>
