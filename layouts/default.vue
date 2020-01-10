<template>
  <div id="grids">
    <Header />
    <Menu />
    <div id="main">
      <main>
        <nuxt />
      </main>
    </div>
  </div>

</template>

<script>
import Header from '@/components/Header.vue'
import Menu from '@/components/Menu.vue'

export default {
  components: {
    Header,
    Menu
  }
}
</script>

<style lang="less">
@import "~assets/less/grids";
</style>
