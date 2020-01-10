<template>
  <div id="menu" class="hidden">
    <MenuBar />
    <div id="menu-list">
      <nav>
        <ul>
          <li><a href="https://t-matsudate.github.io">Back to Portfolio</a></li>
          <li><nuxt-link to="/">目次</nuxt-link></li>
          <li><nuxt-link to="/articles/overview">RTMP の概要</nuxt-link></li>
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
  }
}
</script>

<style lang="less">
@import "~assets/less/menu";
</style>
