<template>
  <q-page class="q-pa-md page-wrap">
    <q-card flat bordered class="control-card q-mb-md">
      <q-card-section class="row items-center q-col-gutter-md q-px-md q-py-sm">
        <div class="col-12 col-sm-auto">
          <div class="row items-center no-wrap q-gutter-xs">
            <q-icon
              name="lens"
              size="11px"
              :color="annotationStore.isConnected ? 'positive' : 'negative'"
            />
            <span class="text-body2 text-weight-medium">
              {{
                annotationStore.isConnected
                  ? t('annotation.status.connected')
                  : t('annotation.status.disconnected')
              }}
            </span>
          </div>
        </div>

        <div class="col-12 col-sm-auto">
          <q-btn
            v-if="!annotationStore.isConnected"
            color="primary"
            unelevated
            :label="t('annotation.actions.connect')"
            @click="onStartListening(true)"
          />
        </div>

        <div class="col-12 col-md">
          <q-select
            :model-value="selectedClassId"
            :options="annotationStore.classOptions"
            option-value="value"
            option-label="label"
            emit-value
            map-options
            dense
            filled
            :label="t('annotation.classSelect')"
            @update:model-value="onClassChange"
          >
            <template #option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section avatar>
                  <q-avatar size="10px" :style="{ background: scope.opt.color }" />
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ scope.opt.label }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
            <template #selected-item="scope">
              <div class="row items-center no-wrap q-gutter-xs">
                <q-avatar size="10px" :style="{ background: scope.opt.color }" />
                <span>{{ scope.opt.label }}</span>
              </div>
            </template>
          </q-select>
        </div>

        <div class="col-auto">
          <q-badge rounded color="grey-8" text-color="white" class="queue-badge">
            {{ t('annotation.queue', { count: annotationStore.queueLength }) }}
          </q-badge>
        </div>

        <div class="col-auto">
          <q-btn flat round dense icon="more_vert" color="grey-7">
            <q-tooltip>{{ t('annotation.actions.tools') }}</q-tooltip>
            <q-menu anchor="bottom right" self="top right">
              <q-list style="min-width: 220px">
                <q-item clickable v-close-popup @click="onEnqueueMock">
                  <q-item-section avatar>
                    <q-icon name="science" />
                  </q-item-section>
                  <q-item-section>{{ t('annotation.actions.mock') }}</q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
        </div>
      </q-card-section>
    </q-card>

    <div class="text-caption text-grey-7 q-mb-md instructions-text">
      {{ t('annotation.instructions') }}
    </div>

    <q-card v-if="annotationStore.current" bordered flat class="current-image-card">
      <q-card-section class="row items-center justify-between q-px-md q-py-sm">
        <div class="text-h6">{{ t('annotation.currentFrame') }}</div>
        <q-badge rounded color="grey-2" text-color="grey-9">
          {{ t('annotation.queue', { count: annotationStore.queueLength }) }}
        </q-badge>
      </q-card-section>

      <q-separator />

      <q-card-section class="q-pa-sm">
        <div class="row q-col-gutter-sm annotation-workspace">
          <div class="col-12 col-lg">
            <annotation-canvas
              :image-src="currentImageSrc"
              :class-color="annotationStore.classColor"
              :class-name="annotationStore.className"
              :selected-box-index="selectedBoxIndex"
              :selected-class-id="selectedClassId"
              :boxes="currentBoxes"
              @update:boxes="onBoxesUpdate"
              @update:selected-box-index="onSelectedBoxIndexChange"
              @update:selected-class-id="onClassChange"
              @image-load-failed="onImageLoadFailed"
            />
          </div>

          <div class="col-12 col-lg-4 col-xl-3">
            <q-card flat bordered class="labels-panel">
              <q-card-section class="q-px-sm q-py-xs">
                <div class="text-subtitle2">{{ t('annotation.labels.title') }}</div>
                <div class="text-caption text-grey-7">{{ t('annotation.labels.deleteHint') }}</div>
              </q-card-section>
              <q-separator />

              <q-list dense separator class="labels-list">
                <q-item
                  v-for="(box, index) in currentBoxes"
                  :key="`${index}-${box.classId}-${box.x}-${box.y}`"
                  clickable
                  :active="selectedBoxIndex === index"
                  active-class="label-item-active"
                  @click="onSelectBox(index)"
                >
                  <q-item-section avatar>
                    <q-avatar size="10px" :style="{ background: annotationStore.classColor(box.classId) }" />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label>{{ annotationStore.className(box.classId) }}</q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-btn
                      flat
                      round
                      dense
                      color="negative"
                      icon="close"
                      @click.stop="onDeleteBox(index)"
                    />
                  </q-item-section>
                </q-item>

                <q-item v-if="currentBoxes.length === 0">
                  <q-item-section>
                    <q-item-label caption>{{ t('annotation.labels.empty') }}</q-item-label>
                  </q-item-section>
                </q-item>
              </q-list>
            </q-card>
          </div>
        </div>
      </q-card-section>

      <q-separator />

      <q-card-actions align="right" class="q-px-md q-py-sm">
        <q-btn
          color="positive"
          :label="t('annotation.actions.send')"
          :disable="!annotationStore.current || annotationStore.isSubmitting"
          @click="onSubmitCurrent"
        />
      </q-card-actions>
    </q-card>

    <q-banner v-else rounded class="bg-grey-2 text-grey-9">
      {{ t('annotation.empty') }}
    </q-banner>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuasar } from 'quasar';

import type { AnnotationBox } from 'src/interfaces/Annotation';
import AnnotationCanvas from 'src/components/cards/AnnotationCanvas.vue';
import { useAnnotationStore } from 'src/stores/annotation-store';

const $q = useQuasar();
const { t } = useI18n();
const annotationStore = useAnnotationStore();

const selectedClassId = ref<number>(annotationStore.classOptions[0]?.value ?? 0);
const selectedBoxIndex = ref(-1);

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

watch(
  () => annotationStore.current?.id,
  () => {
    selectedBoxIndex.value = -1;
  }
);

watch(currentBoxes, (boxes) => {
  if (selectedBoxIndex.value >= boxes.length) {
    selectedBoxIndex.value = -1;
  }
});

onMounted(() => {
  void onStartListening(false);
});

function onClassChange(value: number | null) {
  if (value === null) {
    return;
  }

  selectedClassId.value = value;
}

function onBoxesUpdate(boxes: AnnotationBox[]) {
  annotationStore.setCurrentBoxes(boxes);
}

function onSelectedBoxIndexChange(value: number) {
  selectedBoxIndex.value = value;
}

function onSelectBox(index: number) {
  selectedBoxIndex.value = index;
}

function onDeleteBox(index: number) {
  const nextBoxes = currentBoxes.value.filter((_, itemIndex) => itemIndex !== index);
  annotationStore.setCurrentBoxes(nextBoxes);

  if (selectedBoxIndex.value === index) {
    selectedBoxIndex.value = -1;
    return;
  }

  if (selectedBoxIndex.value > index) {
    selectedBoxIndex.value -= 1;
  }
}

function onImageLoadFailed(message: string) {
  $q.notify({
    type: 'negative',
    message: `${t('annotation.notify.imageLoadFailed')}: ${message}`,
  });
}

async function onStartListening(showNotify = true) {
  try {
    await annotationStore.startListening();
    if (showNotify) {
      $q.notify({
        type: 'positive',
        message: t('annotation.notify.connected'),
      });
    }
  } catch {
    if (showNotify) {
      $q.notify({
        type: 'negative',
        message: t('annotation.notify.connectFailed'),
      });
    }
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

<style scoped>
.page-wrap {
  max-width: 1120px;
  margin: 0 auto;
}

.control-card {
  max-width: 980px;
  margin: 0 auto;
}

.current-image-card {
  max-width: 880px;
  margin: 0 auto;
}

.queue-badge {
  font-size: 12px;
  padding: 6px 10px;
}

.instructions-text {
  max-width: 920px;
  margin-left: auto;
  margin-right: auto;
}

.annotation-workspace {
  align-items: flex-start;
}

.labels-panel {
  height: 100%;
}

.labels-list {
  max-height: 560px;
  overflow: auto;
}

.label-item-active {
  background: rgba(210, 38, 48, 0.12);
}
</style>
