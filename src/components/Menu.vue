<template>
  <div id="menu" class="hidden">
    <MenuBar />
    <div id="menu-list">
      <nav>
        <ul>
          <li><a href="https://t-matsudate.github.io">Back to Portfolio</a></li>
          <router-link tag="li" to="/overview">RTMPの概要</router-link>
        </ul>
      </nav>
    </div>
  </div>
</template>

<script>
import MenuBar from './MenuBar.vue'

export default {
    name: 'Menu',
    components: {
        MenuBar
    }
}
</script>

<style lang="less">
#grids {
    #menu {
        z-index: 2;
        position: fixed;
        top: 0;
        bottom: 0;
        overflow-y: scroll;

        @media (orientation: landscape) {
            width: 20%;
        }

        @media (orientation: portrait) {
            width: 50%;
        }

        background-color: hsl(90, 50%, 999%);

        .menu-bar {
            padding: 1em;

            a {
                .fas {
                    font-size: 200%;
                    color: hsl(90, 80%, 40%);
                }
            }
        }

        #menu-list {
            nav {
                li {
                    font-size: 100%;
                    font-weight: normal;
                    font-style: normal;
                    padding: 0.5em;

                    a {
                        color: hsl(0, 0%, 0%);
                        text-decoration: none;
                    }
                }
            }
        }

        &.hidden {
            display: none;
        }

        &.shown {
            display: block;
        }
    }
}
</style>
