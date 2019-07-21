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
    name: 'Header',
    components: {
        MenuBar
    }
}
</script>

<style lang="less">
#grids {
    #header {
        z-index: 1;
        position: fixed;
        grid-row: 1;
        width: 100%;
        background-color: hsl(90, 80%, 40%);
        color: hsl(270, 100%, 100%);

        header {
            display: grid;
            grid-template-columns: 3em auto;

            .menu-bar {
                grid-column: 1;
                padding: 1em;

                a {
                    .fas {
                        font-size: 200%;
                        color: hsl(270, 100%, 100%);
                    }
                }
            }

            #app-title {
                grid-column: 2;
                padding: 0.5em;
                font-size: 200%;
                font-weight: bold;
                font-style: normal;
            }
        }
    }
}
</style>
