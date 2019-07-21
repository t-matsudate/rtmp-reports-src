<template>
  <div id="grids">
    <Header />
    <Menu />
    <Main />
  </div>
</template>

<script>
import Header from './Header.vue'
import Menu from './Menu.vue'
import Main from './Main.vue'

export default {
    name: 'GridMenu',
    components: {
        Header,
        Menu,
        Main
    }
}
</script>

<style lang="less">
* {
    margin: 0;
    padding: 0;
}

#grids {
    display: grid;
    grid-template-rows: repeat(2, auto);

    a {
        color: hsl(90, 80%, 40%);
    }
}
</style>
