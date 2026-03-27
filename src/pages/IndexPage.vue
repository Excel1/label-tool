<template>
  <q-page class="q-pa-md">
    <div class="row q-col-gutter-sm q-mb-md">
      <q-btn
        color="primary"
        :label="t('annotation.actions.connect')"
        :disable="annotationStore.isConnected"
        @click="onStartListening"
      />
      <q-btn
        color="secondary"
        :label="t('annotation.actions.mock')"
        @click="onEnqueueMock"
      />
      <q-btn
        color="positive"
        :label="t('annotation.actions.send')"
        :disable="!annotationStore.current || annotationStore.isSubmitting"
        @click="onSubmitCurrent"
      />
    </div>

    <div class="row q-col-gutter-sm q-mb-md">
      <div class="col-12 col-md-5">
        <q-select
          :model-value="selectedClassId"
          :options="annotationStore.classOptions"
          option-value="value"
          option-label="label"
          emit-value
          map-options
          filled
          :label="t('annotation.classSelect')"
          @update:model-value="onClassChange"
        />
      </div>
    </div>

    <div class="text-subtitle2 q-mb-sm">
      {{ t('annotation.queue', { count: annotationStore.queueLength }) }}
    </div>
    <div class="text-caption text-grey-7 q-mb-md">
      {{ t('annotation.instructions') }}
    </div>

    <q-card v-if="annotationStore.current" bordered flat>
      <q-card-section>
        <div class="text-h6">{{ t('annotation.currentFrame') }}</div>
      </q-card-section>

      <q-separator />

      <q-card-section>
        <annotation-canvas
          :image-src="currentImageSrc"
          :class-color="annotationStore.classColor"
          :selected-class-id="selectedClassId"
          :boxes="currentBoxes"
          @update:boxes="onBoxesUpdate"
          @update:selected-class-id="onClassChange"
          @image-load-failed="onImageLoadFailed"
        />
      </q-card-section>
    </q-card>

    <q-banner v-else rounded class="bg-grey-2 text-grey-9">
      {{ t('annotation.empty') }}
    </q-banner>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuasar } from 'quasar';

import type { AnnotationBox } from 'src/interfaces/Annotation';
import AnnotationCanvas from 'src/components/cards/AnnotationCanvas.vue';
import { useAnnotationStore } from 'src/stores/annotation-store';

const $q = useQuasar();
const { t } = useI18n();
const annotationStore = useAnnotationStore();

const selectedClassId = ref<number>(annotationStore.classOptions[0]?.value ?? 0);

const currentImageSrc = computed(() => {
  const image = annotationStore.current?.image ?? '';
  if (!image) {
    return '';
  }

  return image.startsWith('data:image') ? image : `data:image/jpeg;base64,${image}`;
});

const currentBoxes = computed(() => annotationStore.current?.boxes ?? []);

watch(
  () => annotationStore.classOptions,
  (options) => {
    if (!options.some((option) => option.value === selectedClassId.value)) {
      selectedClassId.value = options[0]?.value ?? 0;
    }
  },
  { immediate: true }
);

function onClassChange(value: number | null) {
  if (value === null) {
    return;
  }

  selectedClassId.value = value;
}

function onBoxesUpdate(boxes: AnnotationBox[]) {
  annotationStore.setCurrentBoxes(boxes);
}

function onImageLoadFailed(message: string) {
  $q.notify({
    type: 'negative',
    message: `${t('annotation.notify.imageLoadFailed')}: ${message}`,
  });
}

async function onStartListening() {
  try {
    await annotationStore.startListening();
    $q.notify({
      type: 'positive',
      message: t('annotation.notify.connected'),
    });
  } catch {
    $q.notify({
      type: 'negative',
      message: t('annotation.notify.connectFailed'),
    });
  }
}

async function onEnqueueMock() {
  try {
    await annotationStore.enqueueMockFrame();
    $q.notify({
      type: 'positive',
      message: t('annotation.notify.mockQueued'),
    });
  } catch {
    $q.notify({
      type: 'negative',
      message: t('annotation.notify.mockFailed'),
    });
  }
}

async function onSubmitCurrent() {
  if (!annotationStore.current) {
    return;
  }

  try {
    await annotationStore.submitCurrent();
    $q.notify({
      type: 'positive',
      message: t('annotation.notify.sent'),
    });
  } catch {
    $q.notify({
      type: 'negative',
      message: t('annotation.notify.sendFailed'),
    });
  }
}
</script>
