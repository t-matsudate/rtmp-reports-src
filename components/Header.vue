<template>
  <div id="header">
    <header>
      <MenuBar />
      <h1 id="app-title">RTMP Implementation Reports</h1>
    </header>
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
@import "~assets/less/header";
</style>
