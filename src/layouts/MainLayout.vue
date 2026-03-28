<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated class="app-header">
      <q-toolbar class="app-toolbar">
        <q-toolbar-title class="text-weight-bold">
          label tool
        </q-toolbar-title>

        <div class="text-caption text-weight-medium">V.1.0.0</div>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<style scoped>
.app-header {
  background: #d22630;
  color: #ffffff;
}

.app-toolbar {
  min-height: 60px;
}
</style>
