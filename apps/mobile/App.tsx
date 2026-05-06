import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Image, LayoutAnimation, Modal, PanResponder, Platform, Pressable, SafeAreaView, ScrollView, Switch, Text, TextInput, UIManager, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatDaysLabel, normalizeDateInput } from '@appfridge/shared';
import type { ProductCategory, RecipeSuggestion } from '@appfridge/shared';
import {
  AiRequestError,
  addInventoryItem,
  fetchAiRecipes,
  fetchInventory,
  lookupProduct,
  registerPushToken,
  removeInventoryItem,
  scanExpiryDateFromImage,
  fetchSaladChefOrders,
  scanProductNameFromImage,
  unregisterPushToken,
  updateInventoryItem,
  type ProfileOwner
} from './src/api';
import { registerForPushNotificationsAsync } from './src/notifications';
import { styles } from './src/styles';
import type { InventoryResponseItem } from './src/types';

type LocationType = 'fridge' | 'freezer' | 'pantry';
type AiNoticeTone = 'neutral' | 'ok' | 'error';
type DateStepSource = 'camera' | 'manual';
type SaladCategory = 'Овочі' | 'Сири' | 'Зелень' | 'Додатки';
type SaladCategoryFilter = SaladCategory | 'Усе';
type SaladChefOrder = {
  id: string;
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
};

function ProfileWaterfallDecor() {
  const streams = useRef(
    Array.from({ length: 7 }, (_, index) => ({
      x: 8 + index * 14,
      delay: index * 260,
      duration: 2400 + (index % 3) * 380,
      opacity: 0.1 + (index % 4) * 0.03,
      progress: new Animated.Value(0)
    }))
  ).current;

  useEffect(() => {
    const loops = streams.map((stream) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(stream.progress, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true
          }),
          Animated.delay(stream.delay),
          Animated.timing(stream.progress, {
            toValue: 1,
            duration: stream.duration,
            easing: Easing.linear,
            useNativeDriver: true
          })
        ])
      )
    );
    loops.forEach((loop) => loop.start());
    return () => {
      loops.forEach((loop) => loop.stop());
    };
  }, [streams]);

  return (
    <View pointerEvents="none" style={styles.profileWaterfallLayer}>
      {streams.map((stream, index) => {
        const translateY = stream.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [-120, 520]
        });
        return (
          <Animated.View
            key={`waterfall-${index}`}
            style={[
              styles.profileWaterfallDrop,
              {
                left: `${stream.x}%`,
                opacity: stream.opacity,
                transform: [{ translateY }]
              }
            ]}
          />
        );
      })}
    </View>
  );
}

function TwinkleStarsDecor() {
  const stars = useRef(
    Array.from({ length: 24 }, (_, index) => ({
      leftPct: 4 + ((index * 7) % 92),
      topPct: 6 + ((index * 11) % 88),
      size: 2 + (index % 5),
      delay: index * 130,
      duration: 1600 + (index % 5) * 260,
      alpha: new Animated.Value(0.08),
      scale: new Animated.Value(0.9)
    }))
  ).current;

  useEffect(() => {
    const loops = stars.map((star) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(star.delay),
          Animated.parallel([
            Animated.timing(star.alpha, {
              toValue: 0.26,
              duration: Math.round(star.duration * 0.5),
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true
            }),
            Animated.timing(star.scale, {
              toValue: 1.2,
              duration: Math.round(star.duration * 0.5),
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true
            })
          ]),
          Animated.parallel([
            Animated.timing(star.alpha, {
              toValue: 0.07,
              duration: Math.round(star.duration * 0.5),
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true
            }),
            Animated.timing(star.scale, {
              toValue: 0.88,
              duration: Math.round(star.duration * 0.5),
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true
            })
          ])
        ])
      )
    );
    loops.forEach((loop) => loop.start());
    return () => {
      loops.forEach((loop) => loop.stop());
    };
  }, [stars]);

  return (
    <View pointerEvents="none" style={styles.twinkleLayer}>
      {stars.map((star, index) => (
        <Animated.View
          key={`twinkle-${index}`}
          style={[
            styles.twinkleStar,
            {
              left: `${star.leftPct}%`,
              top: `${star.topPct}%`,
              width: star.size,
              height: star.size,
              opacity: star.alpha,
              transform: [{ scale: star.scale }]
            }
          ]}
        />
      ))}
    </View>
  );
}

const LOCATION_OPTIONS: Array<{ value: LocationType; label: string }> = [
  { value: 'fridge', label: 'Холодильник' },
  { value: 'freezer', label: 'Морозильна камера' }
];
const KUROMI_BG_IMAGE_URI = 'https://upload.wikimedia.org/wikipedia/commons/7/74/Kuromi_clothing_and_accessories.jpg';
const KUROMI_TITLE_IMAGE_URI = 'https://upload.wikimedia.org/wikipedia/commons/7/74/Kuromi_clothing_and_accessories.jpg';
const VLAD_PROFILE_IMAGE = require('./assets/vlad-profile.jpeg');
const RIMMA_PROFILE_IMAGE = require('./assets/rimma-profile.jpeg');
const RIMMA_KUROMI_LOGO_IMAGE = require('./assets/rimma-kuromi-logo.png');
const RIMMA_KUROMI_A_IMAGE = require('./assets/rimma-kuromi-a.png');
const RIMMA_KUROMI_B_IMAGE = require('./assets/rimma-kuromi-b.png');
const RIMMA_KUROMI_C_IMAGE = require('./assets/rimma-kuromi-c.png');
const PUSH_ENABLED_STORAGE_KEY = '@appfridge_push_enabled';
const PUSH_TOKEN_STORAGE_KEY = '@appfridge_push_token';
const ACTIVE_PROFILE_STORAGE_KEY = '@appfridge_active_profile';
const FAVORITE_SALADS_STORAGE_PREFIX = '@appfridge_favorite_salads';
const FAVORITE_SALADS_COLLAPSED_PREFIX = '@appfridge_favorite_salads_collapsed';
const SALAD_MARKET_ITEMS: Array<{ name: string; category: SaladCategory; country: 'PL' | 'UA' | 'PL/UA' }> = [
  { name: 'Помідор', category: 'Овочі', country: 'PL/UA' },
  { name: 'Огірок', category: 'Овочі', country: 'PL/UA' },
  { name: 'Червона цибуля', category: 'Овочі', country: 'PL/UA' },
  { name: 'Болгарський перець', category: 'Овочі', country: 'PL/UA' },
  { name: 'Кукурудза', category: 'Овочі', country: 'PL/UA' },
  { name: 'Авокадо', category: 'Овочі', country: 'PL/UA' },
  { name: 'Морква', category: 'Овочі', country: 'PL/UA' },
  { name: 'Селера', category: 'Овочі', country: 'PL/UA' },
  { name: 'Броколі', category: 'Овочі', country: 'PL/UA' },
  { name: 'Редис', category: 'Овочі', country: 'PL/UA' },
  { name: 'Фета', category: 'Сири', country: 'PL/UA' },
  { name: 'Моцарела', category: 'Сири', country: 'PL/UA' },
  { name: 'Бринза', category: 'Сири', country: 'UA' },
  { name: 'Осципек', category: 'Сири', country: 'PL' },
  { name: 'Пармезан', category: 'Сири', country: 'PL/UA' },
  { name: 'Салат Ромен', category: 'Зелень', country: 'PL/UA' },
  { name: 'Рукола', category: 'Зелень', country: 'PL/UA' },
  { name: 'Шпинат', category: 'Зелень', country: 'PL/UA' },
  { name: 'Кріп', category: 'Зелень', country: 'PL/UA' },
  { name: 'Петрушка', category: 'Зелень', country: 'PL/UA' },
  { name: 'Оливки', category: 'Додатки', country: 'PL/UA' },
  { name: 'Гарбузове насіння', category: 'Додатки', country: 'UA' },
  { name: 'Соняшникове насіння', category: 'Додатки', country: 'UA' },
  { name: 'Крутони', category: 'Додатки', country: 'PL/UA' },
  { name: 'Волоський горіх', category: 'Додатки', country: 'PL/UA' }
];
const SALAD_CATEGORY_TABS: SaladCategoryFilter[] = ['Усе', 'Овочі', 'Сири', 'Зелень', 'Додатки'];

function saladIconForItem(name: string, category: SaladCategory): string {
  const v = name.toLowerCase();
  if (v.includes('помід')) return '🍅';
  if (v.includes('огір')) return '🥒';
  if (v.includes('перець')) return '🫑';
  if (v.includes('цибул')) return '🧅';
  if (v.includes('морк')) return '🥕';
  if (v.includes('брок')) return '🥦';
  if (v.includes('авок')) return '🥑';
  if (v.includes('олив')) return '🫒';
  if (v.includes('горіх')) return '🌰';
  if (category === 'Сири') return '🧀';
  if (category === 'Зелень') return '🌿';
  if (category === 'Додатки') return '✨';
  return '🥗';
}

function getTodayParts() {
  const now = new Date();
  return {
    day: String(now.getDate()).padStart(2, '0'),
    month: String(now.getMonth() + 1).padStart(2, '0'),
    year: String(now.getFullYear())
  };
}

function isGenericUnknownProductName(name: string, barcode: string): boolean {
  return name.trim().toLowerCase() === `товар ${barcode}`.toLowerCase();
}

function formatLocationLabel(location: LocationType): string {
  if (location === 'fridge') {
    return 'Холодильник';
  }
  if (location === 'freezer') {
    return 'Морозильна камера';
  }
  return 'Комора';
}

function formatStatusLabel(status: InventoryResponseItem['insight']['status']): string {
  if (status === 'expired') {
    return 'Прострочено';
  }
  if (status === 'expiring') {
    return 'Скоро закінчиться';
  }
  return 'Свіжий';
}

function formatExpirationLabel(item: InventoryResponseItem): string {
  if (item.location === 'freezer') {
    return 'Без терміну (морозилка)';
  }
  return item.expirationDate;
}

function formatShelfLifeLabel(item: InventoryResponseItem): string {
  if (item.location === 'freezer') {
    return 'Заморожено';
  }
  return formatDaysLabel(item.insight.daysLeft);
}

function sortByExpiryPriority(items: InventoryResponseItem[]): InventoryResponseItem[] {
  return [...items].sort((a, b) => {
    const aDays = a.insight.daysLeft ?? Number.MAX_SAFE_INTEGER;
    const bDays = b.insight.daysLeft ?? Number.MAX_SAFE_INTEGER;
    if (aDays !== bDays) {
      return aDays - bDays;
    }
    if (a.expirationDate !== b.expirationDate) {
      return a.expirationDate.localeCompare(b.expirationDate);
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function inferProductCategory(name: string): ProductCategory {
  const v = name.toLowerCase();
  if (!v.trim()) return 'Інше';
  if (/(молок|кефір|сметан|вершк|масл|cream|milk)/i.test(v)) return 'Молочні продукти';
  if (/(сир|cheese|gouda|моцарел|бринз|almette)/i.test(v)) return 'Сири';
  if (/(йогур|десерт|pudding)/i.test(v)) return 'Йогурти та десерти';
  if (/(ковбас|сосиск|салям|шинка|ham|sausage)/i.test(v)) return 'Ковбаси';
  if (/(м.?яс|курк|індич|ялович|свинин|beef|chicken|turkey|pork)/i.test(v)) return "М'ясо";
  if (/(риба|лосос|тунец|оселед|shrimp|fish|salmon|tuna)/i.test(v)) return 'Риба та морепродукти';
  if (/(овоч|томат|помідор|огір|морк|картоп|цибул|перец|капуст)/i.test(v)) return 'Овочі';
  if (/(фрукт|яблук|банан|апельсин|лимон|груш|виноград|kiwi)/i.test(v)) return 'Фрукти';
  if (/(сік|вода|cola|fanta|sprite|чай|кава|напій|drink|juice)/i.test(v)) return 'Напої';
  if (/(чипс|сухарик|горіш|крекер|snack)/i.test(v)) return 'Снеки';
  if (/(шоколад|цукерк|печив|торт|вафл|цукор|dessert|cookie)/i.test(v)) return 'Солодощі';
  if (/(заморож|морозив|pelmeni|пельмен|нагетс|frozen)/i.test(v)) return 'Заморожені продукти';
  if (/(консерв|тунец у бан|горошок|кукурудз)/i.test(v)) return 'Консерви';
  if (/(соус|кетчуп|майонез|гірчиц|sauce)/i.test(v)) return 'Соуси';
  if (/(хліб|булк|батон|лаваш|bun|bread)/i.test(v)) return 'Хліб та випічка';
  if (/(макарон|паста|рис|греч|круп|вівсян)/i.test(v)) return 'Крупи та макарони';
  if (/(готов|сендвіч|салат|піца|суп)/i.test(v)) return 'Готові страви';
  return 'Інше';
}

type InventoryTileProps = {
  item: InventoryResponseItem;
  aiSelected: boolean;
  bulkMode: boolean;
  bulkSelected: boolean;
  onOpen: (item: InventoryResponseItem) => void;
  onToggleAi: (id: string) => void;
  onStartBulkSelect: (id: string) => void;
  onToggleBulkSelect: (id: string) => void;
  onSwipeMove: (item: InventoryResponseItem, to: 'fridge' | 'freezer') => void;
  onSwipeDelete: (id: string) => void;
  onSwipeActiveChange: (active: boolean) => void;
};

type QuantityWheelProps = {
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
};

type PhotoProcessingOverlayProps = {
  visible: boolean;
  label: string;
  inline?: boolean;
  overlayInParent?: boolean;
};

function PhotoProcessingOverlay({ visible, label, inline = false, overlayInParent = false }: PhotoProcessingOverlayProps) {
  const door = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const wobble = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.35)).current;
  const shelfShift = useRef(new Animated.Value(0)).current;
  const snowA = useRef(new Animated.Value(0)).current;
  const snowB = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      door.setValue(0);
      pulse.setValue(1);
      wobble.setValue(0);
      glow.setValue(0.35);
      shelfShift.setValue(0);
      snowA.setValue(0);
      snowB.setValue(0);
      return;
    }

    const doorLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(door, {
          toValue: 1,
          duration: 520,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(door, {
          toValue: 0,
          duration: 520,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.04,
          duration: 450,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 450,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    );

    const wobbleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(wobble, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(wobble, {
          toValue: -1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(wobble, {
          toValue: 0,
          duration: 500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    );

    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 0.72,
          duration: 560,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(glow, {
          toValue: 0.35,
          duration: 560,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    );

    const shelfLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shelfShift, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(shelfShift, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    );

    const snowLoopA = Animated.loop(
      Animated.timing(snowA, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true
      })
    );
    const snowLoopB = Animated.loop(
      Animated.timing(snowB, {
        toValue: 1,
        duration: 1700,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true
      })
    );

    doorLoop.start();
    pulseLoop.start();
    wobbleLoop.start();
    glowLoop.start();
    shelfLoop.start();
    snowLoopA.start();
    snowLoopB.start();

    return () => {
      doorLoop.stop();
      pulseLoop.stop();
      wobbleLoop.stop();
      glowLoop.stop();
      shelfLoop.stop();
      snowLoopA.stop();
      snowLoopB.stop();
    };
  }, [door, pulse, wobble, glow, shelfShift, snowA, snowB, visible]);

  const doorTransform = {
    transform: [
      {
        translateX: door.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 8]
        })
      }
    ]
  };
  const fridgeWobbleStyle = {
    transform: [
      {
        rotate: wobble.interpolate({
          inputRange: [-1, 0, 1],
          outputRange: ['-3deg', '0deg', '3deg']
        })
      },
      {
        translateY: wobble.interpolate({
          inputRange: [-1, 0, 1],
          outputRange: [1, -2, 1]
        })
      }
    ]
  };
  const shelfShiftStyle = {
    transform: [
      {
        translateX: shelfShift.interpolate({
          inputRange: [0, 1],
          outputRange: [-4, 4]
        })
      }
    ]
  };
  const snowAStyle = {
    transform: [
      {
        translateY: snowA.interpolate({
          inputRange: [0, 1],
          outputRange: [-6, 6]
        })
      }
    ]
  };
  const snowBStyle = {
    transform: [
      {
        translateY: snowB.interpolate({
          inputRange: [0, 1],
          outputRange: [5, -5]
        })
      }
    ]
  };

  if (!visible) {
    return null;
  }

  if (inline) {
    return (
      <View style={overlayInParent ? styles.processingInlineOverlay : styles.processingInlineWrap}>
        <Animated.View style={[styles.processingCard, { transform: [{ scale: pulse }] }]}>
          <Animated.View style={[styles.processingFridge, fridgeWobbleStyle]}>
            <Animated.View style={[styles.processingFridgeGlow, { opacity: glow }]} />
            <View style={styles.processingShelfTop}>
              <Animated.View style={[styles.processingFoodDotA, shelfShiftStyle]} />
              <Animated.View style={[styles.processingFoodDotB, shelfShiftStyle]} />
            </View>
            <View style={styles.processingShelfBottom}>
              <Animated.View style={[styles.processingFoodDotC, shelfShiftStyle]} />
            </View>
            <Animated.View style={[styles.processingFridgeDoor, doorTransform]} />
            <View style={styles.processingFridgeHandle} />
            <Animated.Text style={[styles.processingSnowA, snowAStyle]}>❄️</Animated.Text>
            <Animated.Text style={[styles.processingSnowB, snowBStyle]}>❄️</Animated.Text>
          </Animated.View>
          <Text style={styles.processingTitle}>Обробляємо фото…</Text>
          <Text style={styles.processingText}>{label}</Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.processingOverlay}>
        <Animated.View style={[styles.processingCard, { transform: [{ scale: pulse }] }]}>
          <Animated.View style={[styles.processingFridge, fridgeWobbleStyle]}>
            <Animated.View style={[styles.processingFridgeGlow, { opacity: glow }]} />
            <View style={styles.processingShelfTop}>
              <Animated.View style={[styles.processingFoodDotA, shelfShiftStyle]} />
              <Animated.View style={[styles.processingFoodDotB, shelfShiftStyle]} />
            </View>
            <View style={styles.processingShelfBottom}>
              <Animated.View style={[styles.processingFoodDotC, shelfShiftStyle]} />
            </View>
            <Animated.View style={[styles.processingFridgeDoor, doorTransform]} />
            <View style={styles.processingFridgeHandle} />
            <Animated.Text style={[styles.processingSnowA, snowAStyle]}>❄️</Animated.Text>
            <Animated.Text style={[styles.processingSnowB, snowBStyle]}>❄️</Animated.Text>
          </Animated.View>
          <Text style={styles.processingTitle}>Обробляємо фото…</Text>
          <Text style={styles.processingText}>{label}</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

function SaladChefLoadingOverlay({ visible }: { visible: boolean }) {
  const knife = useRef(new Animated.Value(0)).current;
  const boardPulse = useRef(new Animated.Value(1)).current;
  const bitsA = useRef(new Animated.Value(0)).current;
  const bitsB = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      knife.setValue(0);
      boardPulse.setValue(1);
      bitsA.setValue(0);
      bitsB.setValue(0);
      return;
    }

    const knifeLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(knife, { toValue: 1, duration: 340, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(knife, { toValue: 0, duration: 420, easing: Easing.inOut(Easing.cubic), useNativeDriver: true })
      ])
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(boardPulse, { toValue: 1.04, duration: 360, useNativeDriver: true }),
        Animated.timing(boardPulse, { toValue: 0.98, duration: 360, useNativeDriver: true })
      ])
    );
    const bitsLoopA = Animated.loop(
      Animated.sequence([
        Animated.timing(bitsA, { toValue: 1, duration: 520, useNativeDriver: true }),
        Animated.timing(bitsA, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(180)
      ])
    );
    const bitsLoopB = Animated.loop(
      Animated.sequence([
        Animated.delay(180),
        Animated.timing(bitsB, { toValue: 1, duration: 580, useNativeDriver: true }),
        Animated.timing(bitsB, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(160)
      ])
    );

    knifeLoop.start();
    pulseLoop.start();
    bitsLoopA.start();
    bitsLoopB.start();
    return () => {
      knifeLoop.stop();
      pulseLoop.stop();
      bitsLoopA.stop();
      bitsLoopB.stop();
    };
  }, [visible, knife, boardPulse, bitsA, bitsB]);

  if (!visible) return null;

  const knifeRotate = knife.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '16deg'] });
  const knifeY = knife.interpolate({ inputRange: [0, 1], outputRange: [0, 9] });
  const bitsAY = bitsA.interpolate({ inputRange: [0, 1], outputRange: [5, -22] });
  const bitsBY = bitsB.interpolate({ inputRange: [0, 1], outputRange: [6, -20] });
  const bitsAOpacity = bitsA.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.75, 0] });
  const bitsBOpacity = bitsB.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.72, 0] });
  const dot1Opacity = knife.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 1, 0.35] });
  const dot2Opacity = knife.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.2, 0.5, 1] });
  const dot3Opacity = knife.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.45, 0.2] });

  return (
    <View style={styles.saladLoadingOverlayInner}>
      <View style={styles.saladLoadingCard}>
        <Text style={styles.saladLoadingBadge}>Chef AI</Text>
        <Animated.View style={[styles.saladLoadingBoard, { transform: [{ scale: boardPulse }] }]}>
          <Text style={styles.saladLoadingVeggies}>🥬  🥒  🍅</Text>
        </Animated.View>
        <Animated.Text style={[styles.saladLoadingKnife, { transform: [{ translateY: knifeY }, { rotate: knifeRotate }] }]}>🔪</Animated.Text>
        <Animated.Text style={[styles.saladLoadingBitsA, { opacity: bitsAOpacity, transform: [{ translateY: bitsAY }] }]}>✦</Animated.Text>
        <Animated.Text style={[styles.saladLoadingBitsB, { opacity: bitsBOpacity, transform: [{ translateY: bitsBY }] }]}>✦</Animated.Text>
        <Text style={styles.saladLoadingTitle}>Готуємо салат</Text>
        <Text style={styles.saladLoadingText}>Шеф нарізає інгредієнти та збирає рецепт…</Text>
        <View style={styles.saladLoadingDotsRow}>
          <Animated.View style={[styles.saladLoadingDot, { opacity: dot1Opacity }]} />
          <Animated.View style={[styles.saladLoadingDot, { opacity: dot2Opacity }]} />
          <Animated.View style={[styles.saladLoadingDot, { opacity: dot3Opacity }]} />
        </View>
      </View>
    </View>
  );
}

function QuantityWheel({ value, min = 1, max = 30, onChange }: QuantityWheelProps) {
  const itemHeight = 44;
  const values = useMemo(() => {
    const out: number[] = [];
    for (let i = min; i <= max; i += 1) {
      out.push(i);
    }
    return out;
  }, [min, max]);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    const clamped = Math.min(max, Math.max(min, value));
    const index = clamped - min;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: index * itemHeight, animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [itemHeight, max, min, value]);

  function applyFromOffset(offsetY: number) {
    const rawIndex = Math.round(offsetY / itemHeight);
    const safeIndex = Math.max(0, Math.min(values.length - 1, rawIndex));
    const next = values[safeIndex];
    if (next !== value) {
      onChange(next);
    }
    scrollRef.current?.scrollTo({ y: safeIndex * itemHeight, animated: true });
  }

  return (
    <View style={styles.qtyWheelWrap}>
      <View pointerEvents="none" style={styles.qtyWheelCenterBand} />
      <ScrollView
        ref={scrollRef}
        style={styles.qtyWheelScroll}
        contentContainerStyle={styles.qtyWheelContent}
        showsVerticalScrollIndicator={false}
        snapToInterval={itemHeight}
        decelerationRate="fast"
        onMomentumScrollEnd={(e) => applyFromOffset(e.nativeEvent.contentOffset.y)}
      >
        {values.map((num) => (
          <View key={num} style={styles.qtyWheelItem}>
            <Text style={[styles.qtyWheelText, num === value ? styles.qtyWheelTextActive : undefined]}>{num}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function InventoryTile({
  item,
  aiSelected,
  bulkMode,
  bulkSelected,
  onOpen,
  onToggleAi,
  onStartBulkSelect,
  onToggleBulkSelect,
  onSwipeMove,
  onSwipeDelete,
  onSwipeActiveChange
}: InventoryTileProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const activeAxisRef = useRef<'none' | 'x' | 'y'>('none');
  const SWIPE_DISTANCE_THRESHOLD = 34;
  const SWIPE_VELOCITY_THRESHOLD = 0.22;
  const SWIPE_DELETE_DISTANCE_THRESHOLD = 58;
  const SWIPE_DELETE_VELOCITY_THRESHOLD = 0.34;
  const statusBorderStyle =
    item.insight.status === 'expired' ? styles.cardDanger : item.insight.status === 'expiring' ? styles.cardWarn : styles.cardFresh;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, gesture) => {
          const ax = Math.abs(gesture.dx);
          const ay = Math.abs(gesture.dy);
          const horizontal = ax > 6 && ax > ay + 2;
          const upward = gesture.dy < -10 && ay > ax + 2;
          return horizontal || upward;
        },
        onMoveShouldSetPanResponderCapture: (_evt, gesture) => {
          const ax = Math.abs(gesture.dx);
          const ay = Math.abs(gesture.dy);
          const horizontal = ax > 6 && ax > ay + 2;
          const upward = gesture.dy < -10 && ay > ax + 2;
          return horizontal || upward;
        },
        onPanResponderGrant: () => {
          activeAxisRef.current = 'none';
          onSwipeActiveChange(true);
        },
        onPanResponderMove: (_evt, gesture) => {
          const ax = Math.abs(gesture.dx);
          const ay = Math.abs(gesture.dy);
          if (activeAxisRef.current === 'none' && (ax > 6 || ay > 6)) {
            activeAxisRef.current = ay > ax + 2 ? 'y' : 'x';
          }

          if (activeAxisRef.current === 'y') {
            const dampedDy = Math.max(-92, Math.min(10, gesture.dy * 0.66));
            translateX.setValue(0);
            translateY.setValue(dampedDy);
            return;
          }

          const dampedDx = Math.max(-90, Math.min(90, gesture.dx * 0.74));
          translateX.setValue(dampedDx);
          translateY.setValue(0);
        },
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderRelease: (_evt, gesture) => {
          const rightSwipeStrong = gesture.dx > SWIPE_DISTANCE_THRESHOLD || (gesture.dx > 18 && gesture.vx > SWIPE_VELOCITY_THRESHOLD);
          const leftSwipeStrong = gesture.dx < -SWIPE_DISTANCE_THRESHOLD || (gesture.dx < -18 && gesture.vx < -SWIPE_VELOCITY_THRESHOLD);
          const upSwipeStrong =
            gesture.dy < -SWIPE_DELETE_DISTANCE_THRESHOLD || (gesture.dy < -22 && gesture.vy < -SWIPE_DELETE_VELOCITY_THRESHOLD);
          const canMoveToFreezer = item.location === 'fridge' && rightSwipeStrong;
          const canMoveToFridge = item.location === 'freezer' && leftSwipeStrong;
          const canDelete = upSwipeStrong && (activeAxisRef.current === 'y' || Math.abs(gesture.dy) > Math.abs(gesture.dx) + 4);
          const target: 'fridge' | 'freezer' | null = canMoveToFreezer ? 'freezer' : canMoveToFridge ? 'fridge' : null;

          if (canDelete) {
            Animated.parallel([
              Animated.timing(translateY, {
                toValue: -160,
                duration: 260,
                easing: Easing.bezier(0.16, 1, 0.3, 1),
                useNativeDriver: true
              }),
              Animated.timing(translateX, {
                toValue: 0,
                duration: 180,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true
              })
            ]).start(() => {
              translateX.setValue(0);
              translateY.setValue(0);
              activeAxisRef.current = 'none';
              onSwipeActiveChange(false);
              onSwipeDelete(item.id);
            });
            return;
          }

          if (target) {
            const flingTo = target === 'freezer' ? 120 : -120;
            Animated.parallel([
              Animated.timing(translateX, {
                toValue: flingTo,
                duration: 320,
                easing: Easing.bezier(0.16, 1, 0.3, 1),
                useNativeDriver: true
              }),
              Animated.spring(translateY, {
                toValue: 0,
                useNativeDriver: true,
                damping: 28,
                stiffness: 110,
                mass: 1.15
              })
            ]).start(() => {
              translateX.setValue(0);
              translateY.setValue(0);
              activeAxisRef.current = 'none';
              onSwipeActiveChange(false);
              onSwipeMove(item, target);
            });
            return;
          }

          onSwipeActiveChange(false);
          Animated.parallel([
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              damping: 28,
              stiffness: 110,
              mass: 1.15
            }),
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
              damping: 28,
              stiffness: 110,
              mass: 1.15
            })
          ]).start(() => {
            activeAxisRef.current = 'none';
          });
        },
        onPanResponderTerminate: () => {
          onSwipeActiveChange(false);
          Animated.parallel([
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              damping: 28,
              stiffness: 110,
              mass: 1.15
            }),
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
              damping: 28,
              stiffness: 110,
              mass: 1.15
            })
          ]).start(() => {
            activeAxisRef.current = 'none';
          });
        }
      }),
    [item, onSwipeActiveChange, onSwipeDelete, onSwipeMove, translateX, translateY]
  );

  function handleTilePress() {
    if (bulkMode) {
      onToggleBulkSelect(item.id);
      return;
    }
    onOpen(item);
  }

  return (
    <Animated.View
      {...(bulkMode ? {} : panResponder.panHandlers)}
      style={[
        styles.inventoryTile,
        statusBorderStyle,
        bulkSelected ? styles.inventoryTileSelected : undefined,
        { transform: [{ translateX }, { translateY }] }
      ]}
    >
      <Pressable style={styles.inventoryTileTop} onPress={handleTilePress} onLongPress={() => onStartBulkSelect(item.id)} delayLongPress={220}>
        <Text numberOfLines={2} style={styles.inventoryTileTitle}>
          {item.name}
        </Text>
        <Text style={styles.inventoryTileMeta}>{item.quantity} шт.</Text>
        <Text style={styles.inventoryTileMeta}>{formatExpirationLabel(item)}</Text>
        <Text style={styles.inventoryTileStatus}>{formatShelfLifeLabel(item)}</Text>
        <Text style={styles.inventoryDragHint}>
          {item.location === 'fridge' ? 'Свайп вправо → у морозилку' : 'Свайп вліво → у холодильник'} • Свайп вгору → видалити
        </Text>
        {bulkSelected ? <Text style={styles.inventoryTileAiTag}>Вибрано</Text> : aiSelected ? <Text style={styles.inventoryTileAiTag}>В AI</Text> : null}
      </Pressable>

      {!bulkMode ? (
        <Pressable style={[styles.inventoryTileAiButton, aiSelected ? styles.inventoryTileAiButtonActive : undefined]} onPress={() => onToggleAi(item.id)}>
          <Text style={styles.inventoryTileAiButtonText}>{aiSelected ? 'В AI' : 'Додати в AI'}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const MemoInventoryTile = memo(
  InventoryTile,
  (prev, next) =>
    prev.aiSelected === next.aiSelected &&
    prev.bulkMode === next.bulkMode &&
    prev.bulkSelected === next.bulkSelected &&
    prev.item.id === next.item.id &&
    prev.item.name === next.item.name &&
    prev.item.quantity === next.item.quantity &&
    prev.item.location === next.item.location &&
    prev.item.expirationDate === next.item.expirationDate &&
    prev.item.insight.status === next.item.insight.status &&
    prev.item.insight.daysLeft === next.item.insight.daysLeft
);

export default function App() {
  const todayDefaults = useMemo(() => getTodayParts(), []);
  const [inventory, setInventory] = useState<InventoryResponseItem[]>([]);
  const [barcode, setBarcode] = useState('');
  const [productName, setProductName] = useState('');
  const [productCategory, setProductCategory] = useState<ProductCategory | ''>('');
  const [productNote, setProductNote] = useState('');
  const [expirationDay, setExpirationDay] = useState(todayDefaults.day);
  const [expirationMonth, setExpirationMonth] = useState(todayDefaults.month);
  const [expirationYear, setExpirationYear] = useState(todayDefaults.year);
  const [quantity, setQuantity] = useState('1');
  const [location, setLocation] = useState<LocationType>('fridge');
  const [scanning, setScanning] = useState(false);
  const [expiryCameraOpen, setExpiryCameraOpen] = useState(false);
  const [expiryCaptureBusy, setExpiryCaptureBusy] = useState(false);
  const [manualProductModalOpen, setManualProductModalOpen] = useState(false);
  const [manualDateModalOpen, setManualDateModalOpen] = useState(false);
  const [finalizeModalOpen, setFinalizeModalOpen] = useState(false);
  const [lastDateStepSource, setLastDateStepSource] = useState<DateStepSource>('camera');
  const [nameCameraOpen, setNameCameraOpen] = useState(false);
  const [nameCaptureBusy, setNameCaptureBusy] = useState(false);
  const [resumeManualProductAfterNameScan, setResumeManualProductAfterNameScan] = useState(false);
  const [manualProductName, setManualProductName] = useState('');
  const [manualProductCategory, setManualProductCategory] = useState<ProductCategory | ''>('');
  const [loading, setLoading] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [aiRecipes, setAiRecipes] = useState<RecipeSuggestion[]>([]);
  const [expandedAiRecipeIds, setExpandedAiRecipeIds] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSelectedItemIds, setAiSelectedItemIds] = useState<string[]>([]);
  const [bulkDeleteMode, setBulkDeleteMode] = useState(false);
  const [bulkSelectedItemIds, setBulkSelectedItemIds] = useState<string[]>([]);
  const [saladModalOpen, setSaladModalOpen] = useState(false);
  const [saladCategoryFilter, setSaladCategoryFilter] = useState<SaladCategoryFilter>('Усе');
  const [saladBowl, setSaladBowl] = useState<Record<string, number>>({});
  const [saladChefOrders, setSaladChefOrders] = useState<SaladChefOrder[]>([]);
  const [favoriteSaladsByProfile, setFavoriteSaladsByProfile] = useState<Record<ProfileOwner, SaladChefOrder[]>>({
    vlad: [],
    rimma: []
  });
  const [favoriteSaladsCollapsedByProfile, setFavoriteSaladsCollapsedByProfile] = useState<Record<ProfileOwner, boolean>>({
    vlad: false,
    rimma: false
  });
  const [saladChefLoading, setSaladChefLoading] = useState(false);
  const [selectedSaladChefOrder, setSelectedSaladChefOrder] = useState<SaladChefOrder | null>(null);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<InventoryResponseItem | null>(null);
  const [aiNotice, setAiNotice] = useState<string>('Порада: додайте 2-3 продукти зі строком до 7 днів, тоді AI дає найкращі рецепти.');
  const [aiNoticeTone, setAiNoticeTone] = useState<AiNoticeTone>('neutral');
  const [swipeLock, setSwipeLock] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [pushSettingReady, setPushSettingReady] = useState(false);
  const [activeProfile, setActiveProfile] = useState<ProfileOwner | null>(null);
  const inventoryLoadInFlightRef = useRef(false);
  const saladLoadingStartedAtRef = useRef(0);
  /** Ігноруємо відповіді застарілих паралельних lookup (подвійний скан / «Знайти» під час запиту). */
  const lookupGenerationRef = useRef(0);
  /** Один акт прийняття з камери: до відкриття сканера знову — блокуємо повторні onBarcodeScanned у тому ж кадрі. */
  const scanConsumedRef = useRef(false);
  const expiryCameraRef = useRef<CameraView | null>(null);
  const nameCameraRef = useRef<CameraView | null>(null);
  const animateListTransition = () => {
    LayoutAnimation.configureNext({
      duration: 420,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.spring, springDamping: 0.92 },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity }
    });
  };

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
      if (saved === 'vlad' || saved === 'rimma') {
        setActiveProfile(saved);
      }
    })();
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    if (!activeProfile) {
      setInventory([]);
      return;
    }
    void loadInventory(activeProfile);
  }, [activeProfile]);

  useEffect(() => {
    if (!activeProfile) {
      return;
    }
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`${FAVORITE_SALADS_STORAGE_PREFIX}_${activeProfile}`);
        if (!raw) {
          setFavoriteSaladsByProfile((current) => ({ ...current, [activeProfile]: [] }));
          return;
        }
        const parsed = JSON.parse(raw) as SaladChefOrder[];
        setFavoriteSaladsByProfile((current) => ({ ...current, [activeProfile]: Array.isArray(parsed) ? parsed : [] }));
      } catch {
        setFavoriteSaladsByProfile((current) => ({ ...current, [activeProfile]: [] }));
      }
    })();
  }, [activeProfile]);

  useEffect(() => {
    if (!activeProfile) {
      return;
    }
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`${FAVORITE_SALADS_COLLAPSED_PREFIX}_${activeProfile}`);
        setFavoriteSaladsCollapsedByProfile((current) => ({
          ...current,
          [activeProfile]: raw === '1'
        }));
      } catch {
        setFavoriteSaladsCollapsedByProfile((current) => ({
          ...current,
          [activeProfile]: false
        }));
      }
    })();
  }, [activeProfile]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PUSH_ENABLED_STORAGE_KEY);
        setPushEnabled(raw == null ? true : raw === '1');
      } finally {
        setPushSettingReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!pushSettingReady || !pushEnabled) {
      return;
    }
    void registerPushNotifications(false);
  }, [pushEnabled, pushSettingReady]);

  useEffect(() => {
    setAiSelectedItemIds((current) => {
      const existing = new Set(inventory.map((item) => item.id));
      return current.filter((id) => existing.has(id));
    });
    setSelectedInventoryItem((current) => {
      if (!current) {
        return null;
      }
      const latest = inventory.find((item) => item.id === current.id);
      return latest ?? null;
    });
    setBulkSelectedItemIds((current) => {
      const existing = new Set(inventory.map((item) => item.id));
      return current.filter((id) => existing.has(id));
    });
  }, [inventory]);

  useEffect(() => {
    if (!bulkDeleteMode) {
      setBulkSelectedItemIds([]);
    }
  }, [bulkDeleteMode]);

  async function registerPushNotifications(showAlerts = true) {
    const result = await registerForPushNotificationsAsync();
    if (!result.ok) {
      if (!showAlerts) {
        return;
      }
      const message =
        result.reason === 'permission_denied'
          ? 'Дозвольте сповіщення в Налаштуваннях iOS: Settings -> Notifications -> AppFridge.'
          : result.reason === 'missing_project_id'
            ? 'Не задано EAS projectId. Додайте EXPO_PUBLIC_EAS_PROJECT_ID у apps/mobile/.env і перезапустіть Expo.'
          : result.message ?? 'Push не налаштовано.';
      Alert.alert('Push не підключено', message);
      return;
    }
    try {
      await registerPushToken(result.registration);
      await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, result.registration.token);
      if (showAlerts) {
        Alert.alert('Push підключено', 'Сповіщення успішно увімкнено на цьому пристрої.');
      }
    } catch {
      if (showAlerts) {
        Alert.alert('Push не збережено', 'Не вдалося передати токен на сервер. Перевірте backend і EXPO_PUBLIC_API_URL.');
      }
    }
  }

  async function handleTogglePush(next: boolean) {
    setPushEnabled(next);
    await AsyncStorage.setItem(PUSH_ENABLED_STORAGE_KEY, next ? '1' : '0');
    if (next) {
      await registerPushNotifications(true);
      return;
    }
    try {
      const token = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
      if (token) {
        await unregisterPushToken(token);
      }
      await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
      Alert.alert('Push вимкнено', 'Сповіщення відключено для цього пристрою.');
    } catch {
      Alert.alert('Помилка', 'Не вдалося вимкнути push на сервері.');
    }
  }

  async function loadInventory(owner: ProfileOwner) {
    if (inventoryLoadInFlightRef.current) {
      return;
    }
    inventoryLoadInFlightRef.current = true;
    try {
      const items = await fetchInventory(owner);
      setInventory(items);
    } catch {
      Alert.alert('Бекенд недоступний', 'Запустіть сервер перед перевіркою мобільного застосунку.');
    } finally {
      inventoryLoadInFlightRef.current = false;
    }
  }

  async function handleLookup(targetBarcode?: string) {
    const code = (targetBarcode ?? barcode).trim();
    if (!code) {
      return;
    }

    const generation = ++lookupGenerationRef.current;
    setLoading(true);
    setBarcode(code);

    try {
      const product = await lookupProduct(code);
      if (generation !== lookupGenerationRef.current) {
        return;
      }
      const resolvedName = isGenericUnknownProductName(product.name, code) ? '' : product.name;
      setProductName(resolvedName);
      setProductCategory((product.category as ProductCategory) ?? '');
      setProductNote(product.note?.trim() ? product.note : '');

      if (product.lookupStatus === 'catalog') {
        setQuantity('1');
        setManualProductModalOpen(false);
        void requestExpiryCamera();
        return;
      }

      setManualProductName(resolvedName);
      setManualProductCategory((product.category as ProductCategory) ?? inferProductCategory(resolvedName));
      setManualProductModalOpen(true);
    } catch {
      if (generation !== lookupGenerationRef.current) {
        return;
      }
      setProductName('');
      setProductCategory('');
      setProductNote('');
      setManualProductName('');
      setManualProductCategory('Інше');
      setManualProductModalOpen(true);
    } finally {
      if (generation === lookupGenerationRef.current) {
        setLoading(false);
      }
    }
  }

  async function requestScanner() {
    scanConsumedRef.current = false;
    if (!permission?.granted) {
      const result = await requestPermission();
      setScanning(result.granted);
      return;
    }

    setScanning(true);
  }

  async function requestExpiryCamera() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        return;
      }
    }
    setExpiryCameraOpen(true);
  }

  async function requestNameCamera() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        return;
      }
    }
    setResumeManualProductAfterNameScan(true);
    setManualProductModalOpen(false);
    setTimeout(() => {
      setNameCameraOpen(true);
    }, 60);
  }

  function closeNameCameraAndReturn() {
    setNameCameraOpen(false);
    if (resumeManualProductAfterNameScan) {
      setTimeout(() => {
        setManualProductModalOpen(true);
      }, 60);
    }
    setResumeManualProductAfterNameScan(false);
  }

  function confirmManualProductEntry() {
    const name = manualProductName.trim();
    if (!name) {
      Alert.alert('Назва потрібна', 'Введіть назву продукту.');
      return;
    }
    const autoCategory = manualProductCategory || inferProductCategory(name);
    setProductName(name);
    setProductCategory(autoCategory);
    setManualProductModalOpen(false);
    void requestExpiryCamera();
  }

  function applyExpiryDateAndOpenFinalize(day: number, month: number, year: number, source: DateStepSource) {
    setExpirationDay(String(day).padStart(2, '0'));
    setExpirationMonth(String(month).padStart(2, '0'));
    setExpirationYear(String(year));
    setLastDateStepSource(source);
    setExpiryCameraOpen(false);
    setManualDateModalOpen(false);
    setFinalizeModalOpen(true);
  }

  function confirmManualDateEntry() {
    const yyyy = expirationYear.replace(/\D/g, '').slice(0, 4);
    const mm = expirationMonth.replace(/\D/g, '').slice(0, 2).padStart(2, '0');
    const dd = expirationDay.replace(/\D/g, '').slice(0, 2).padStart(2, '0');
    const normalized = normalizeDateInput(`${yyyy}-${mm}-${dd}`);
    if (!normalized) {
      Alert.alert('Невірна дата', 'Введіть коректні день/місяць/рік.');
      return;
    }
    const [y, m, d] = normalized.split('-').map((x) => Number(x));
    applyExpiryDateAndOpenFinalize(d, m, y, 'manual');
  }

  async function captureExpiryFromPhoto() {
    if (!expiryCameraRef.current || expiryCaptureBusy) {
      return;
    }
    setExpiryCaptureBusy(true);
    try {
      const photo = await expiryCameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.65,
        skipProcessing: false
      });
      const base64 = photo.base64?.trim();
      if (!base64) {
        Alert.alert('Фото не зчитано', 'Не вдалося отримати фото. Спробуйте ще раз.');
        return;
      }

      const parsed = await scanExpiryDateFromImage({
        imageBase64: base64,
        mimeType: 'image/jpeg'
      });

      applyExpiryDateAndOpenFinalize(parsed.day, parsed.month, parsed.year, 'camera');
    } catch (error) {
      if (error instanceof AiRequestError) {
        Alert.alert('Не вдалося розпізнати дату', error.message);
      } else {
        Alert.alert('Помилка', 'Не вдалося обробити фото. Спробуйте ще раз.');
      }
    } finally {
      setExpiryCaptureBusy(false);
    }
  }

  async function captureProductNameFromPhoto() {
    if (!nameCameraRef.current || nameCaptureBusy) {
      return;
    }
    setNameCaptureBusy(true);
    try {
      const photo = await nameCameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.65,
        skipProcessing: false
      });
      const base64 = photo.base64?.trim();
      if (!base64) {
        Alert.alert('Фото не зчитано', 'Не вдалося отримати фото. Спробуйте ще раз.');
        return;
      }

      const parsed = await scanProductNameFromImage({
        imageBase64: base64,
        mimeType: 'image/jpeg'
      });

      setManualProductName(parsed.name);
      setProductName(parsed.name);
      const autoCategory = inferProductCategory(parsed.name);
      setManualProductCategory(autoCategory);
      setProductCategory(autoCategory);
      closeNameCameraAndReturn();
      Alert.alert('Готово', `Назва розпізнана: ${parsed.name}`);
    } catch (error) {
      if (error instanceof AiRequestError) {
        Alert.alert('Не вдалося розпізнати назву', error.message);
      } else {
        Alert.alert('Помилка', 'Не вдалося обробити фото. Спробуйте ще раз.');
      }
    } finally {
      setNameCaptureBusy(false);
    }
  }

  async function handleAddItem() {
    if (!barcode || !productName || !expirationDay.trim() || !expirationMonth.trim() || !expirationYear.trim()) {
      Alert.alert('Не вистачає даних', 'Потрібні штрихкод, назва і дата закінчення терміну придатності.');
      return;
    }

    const yyyy = expirationYear.replace(/\D/g, '').slice(0, 4);
    const mm = expirationMonth.replace(/\D/g, '').slice(0, 2).padStart(2, '0');
    const dd = expirationDay.replace(/\D/g, '').slice(0, 2).padStart(2, '0');
    const fullExpirationDate = `${yyyy}-${mm}-${dd}`;
    const normalizedExpirationDate = normalizeDateInput(fullExpirationDate);
    if (!normalizedExpirationDate) {
      Alert.alert('Невірна дата', 'Перевірте день, місяць і рік (наприклад 2026-05-09).');
      return;
    }

    try {
      if (!activeProfile) {
        return;
      }
      const created = await addInventoryItem(activeProfile, {
        barcode,
        name: productName,
        expirationDate: normalizedExpirationDate,
        quantity: Math.max(1, Number(quantity) || 1),
        location,
        ...(productCategory ? { category: productCategory } : {}),
        ...(productNote.trim() ? { note: productNote.trim() } : {})
      });

      setInventory((current) => [created, ...current]);
      setBarcode('');
      setProductName('');
      setProductCategory('');
      setProductNote('');
      setExpirationDay(todayDefaults.day);
      setExpirationMonth(todayDefaults.month);
      setExpirationYear(todayDefaults.year);
      setQuantity('1');
      setLocation('fridge');
      setFinalizeModalOpen(false);
      setManualDateModalOpen(false);
      setManualProductModalOpen(false);
      setManualProductCategory('');
    } catch {
      Alert.alert('Помилка', 'Не вдалося додати продукт у бекенд.');
    }
  }

  async function handleDeleteItem(id: string) {
    try {
      if (!activeProfile) {
        return;
      }
      await removeInventoryItem(activeProfile, id);
      animateListTransition();
      setInventory((current) => current.filter((item) => item.id !== id));
      setSelectedInventoryItem((current) => (current?.id === id ? null : current));
    } catch {
      Alert.alert('Помилка', 'Не вдалося видалити продукт.');
    }
  }

  function backFromManualProductStep() {
    setManualProductModalOpen(false);
    void requestScanner();
  }

  function backFromManualDateStep() {
    setManualDateModalOpen(false);
    setTimeout(() => {
      setExpiryCameraOpen(true);
    }, 60);
  }

  function backFromExpiryCameraStep() {
    setExpiryCameraOpen(false);
    setTimeout(() => {
      void requestScanner();
    }, 60);
  }

  function backFromFinalizeStep() {
    setFinalizeModalOpen(false);
    if (lastDateStepSource === 'manual') {
      setTimeout(() => {
        setManualDateModalOpen(true);
      }, 60);
      return;
    }
    setTimeout(() => {
      setExpiryCameraOpen(true);
    }, 60);
  }

  function requestDeleteItem(id: string) {
    const name = inventory.find((item) => item.id === id)?.name;
    Alert.alert(
      'Підтвердьте видалення',
      name ? `Видалити продукт "${name}"?` : 'Видалити цей продукт?',
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Видалити',
          style: 'destructive',
          onPress: () => {
            void handleDeleteItem(id);
          }
        }
      ]
    );
  }

  function toggleAiItemSelection(id: string) {
    setAiSelectedItemIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  function startBulkSelection(id: string) {
    setBulkDeleteMode(true);
    setBulkSelectedItemIds((current) => (current.includes(id) ? current : [...current, id]));
  }

  function toggleBulkSelection(id: string) {
    setBulkSelectedItemIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  async function handleBulkDelete() {
    if (bulkSelectedItemIds.length === 0) {
      setBulkDeleteMode(false);
      return;
    }

    const idsToDelete = [...bulkSelectedItemIds];
    if (!activeProfile) {
      return;
    }
    const results = await Promise.allSettled(idsToDelete.map((id) => removeInventoryItem(activeProfile, id)));
    const deletedIds = idsToDelete.filter((_, index) => results[index].status === 'fulfilled');
    const failedCount = idsToDelete.length - deletedIds.length;

    if (deletedIds.length > 0) {
      animateListTransition();
      setInventory((current) => current.filter((item) => !deletedIds.includes(item.id)));
      setSelectedInventoryItem((current) => (current && deletedIds.includes(current.id) ? null : current));
    }

    setBulkDeleteMode(false);
    setBulkSelectedItemIds([]);

    if (failedCount > 0) {
      Alert.alert('Частково видалено', `Видалено ${deletedIds.length}. Не вдалося видалити: ${failedCount}.`);
    }
  }

  function requestBulkDelete() {
    if (bulkSelectedItemIds.length === 0) {
      Alert.alert('Немає вибору', 'Спочатку виберіть продукти для видалення.');
      return;
    }
    Alert.alert(
      'Видалити вибрані?',
      `Видалити ${bulkSelectedItemIds.length} продукт(и)?`,
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Видалити',
          style: 'destructive',
          onPress: () => {
            void handleBulkDelete();
          }
        }
      ]
    );
  }

  function addToSaladBowl(name: string) {
    setSaladBowl((current) => ({ ...current, [name]: (current[name] ?? 0) + 1 }));
  }

  function removeFromSaladBowl(name: string) {
    setSaladBowl((current) => {
      const next = { ...current };
      const value = (next[name] ?? 0) - 1;
      if (value <= 0) {
        delete next[name];
      } else {
        next[name] = value;
      }
      return next;
    });
  }

  function toggleFavoriteSalad(order: SaladChefOrder) {
    if (!activeProfile) {
      return;
    }
    const storageKey = `${FAVORITE_SALADS_STORAGE_PREFIX}_${activeProfile}`;
    setFavoriteSaladsByProfile((current) => {
      const currentList = current[activeProfile] ?? [];
      const exists = currentList.some((salad) => salad.id === order.id);
      const nextList = exists ? currentList.filter((salad) => salad.id !== order.id) : [...currentList, order];
      void AsyncStorage.setItem(storageKey, JSON.stringify(nextList));
      return {
        ...current,
        [activeProfile]: nextList
      };
    });
  }

  function toggleFavoriteSaladsCollapsed() {
    if (!activeProfile) {
      return;
    }
    const storageKey = `${FAVORITE_SALADS_COLLAPSED_PREFIX}_${activeProfile}`;
    setFavoriteSaladsCollapsedByProfile((current) => {
      const next = !Boolean(current[activeProfile]);
      void AsyncStorage.setItem(storageKey, next ? '1' : '0');
      return {
        ...current,
        [activeProfile]: next
      };
    });
  }

  const saladBowlEntries = useMemo(() => Object.entries(saladBowl).filter(([, qty]) => qty > 0), [saladBowl]);
  const saladTotalItems = useMemo(() => saladBowlEntries.reduce((sum, [, qty]) => sum + qty, 0), [saladBowlEntries]);
  const saladVisibleItems = useMemo(
    () =>
      SALAD_MARKET_ITEMS.filter((item) => (saladCategoryFilter === 'Усе' ? true : item.category === saladCategoryFilter)),
    [saladCategoryFilter]
  );
  const favoriteSalads = activeProfile ? favoriteSaladsByProfile[activeProfile] ?? [] : [];
  const favoriteSaladIds = useMemo(() => new Set(favoriteSalads.map((salad) => salad.id)), [favoriteSalads]);
  const favoriteSaladsCollapsed = activeProfile ? Boolean(favoriteSaladsCollapsedByProfile[activeProfile]) : false;

  async function generateSaladChefOrders() {
    if (saladChefLoading) {
      return;
    }
    if (saladBowlEntries.length === 0) {
      Alert.alert('Порожня тарілочка', 'Додайте інгредієнти перед генерацією салатів.');
      return;
    }
    setSaladModalOpen(false);
    saladLoadingStartedAtRef.current = Date.now();
    setSaladChefLoading(true);
    try {
      const orders = await fetchSaladChefOrders({
        ingredients: saladBowlEntries.map(([name, quantity]) => ({ name, quantity }))
      });
      setSaladChefOrders(orders.slice(0, 2));
      if (orders.length === 0) {
        Alert.alert('Немає варіантів', 'AI не повернув салати. Спробуйте інший набір.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Не вдалося згенерувати салати.';
      Alert.alert('Помилка AI', msg);
    } finally {
      const elapsed = Date.now() - saladLoadingStartedAtRef.current;
      if (elapsed < 900) {
        await new Promise((resolve) => setTimeout(resolve, 900 - elapsed));
      }
      setSaladChefLoading(false);
    }
  }

  async function patchItem(id: string, patch: { location?: LocationType }, options?: { optimistic?: boolean }) {
    const prevItem = inventory.find((item) => item.id === id);
    if (!prevItem) {
      return;
    }

    const optimistic = options?.optimistic ?? true;
    const optimisticItem: InventoryResponseItem = {
      ...prevItem,
      ...(patch.location ? { location: patch.location } : {})
    };

    if (optimistic) {
      animateListTransition();
      setInventory((current) => current.map((item) => (item.id === id ? optimisticItem : item)));
    }

    try {
      if (!activeProfile) {
        return;
      }
      const { item: updated, mergedRemovedId } = await updateInventoryItem(activeProfile, id, patch);
      animateListTransition();
      setInventory((current) => {
        const mapped = current.map((item) => (item.id === id ? updated : item));
        if (!mergedRemovedId) {
          return mapped;
        }
        return mapped.filter((item) => item.id !== mergedRemovedId);
      });
    } catch {
      if (optimistic) {
        animateListTransition();
        setInventory((current) => current.map((item) => (item.id === id ? prevItem : item)));
      }
      Alert.alert('Помилка', 'Не вдалося оновити продукт.');
    }
  }

  async function handleMove(item: InventoryResponseItem, to?: 'fridge' | 'freezer') {
    const target = to ?? (item.location === 'fridge' ? 'freezer' : 'fridge');
    await patchItem(item.id, { location: target }, { optimistic: true });
  }

  async function handleAiRecipes() {
    if (inventory.length === 0) {
      setAiNotice('Спочатку додайте хоча б один продукт у холодильник, а потім запитуйте AI-рецепти.');
      setAiNoticeTone('error');
      setAiRecipes([]);
      return;
    }

    setAiLoading(true);
    setAiNotice('Генеруємо AI-рецепти...');
    setAiNoticeTone('neutral');
    try {
      if (!activeProfile) {
        return;
      }
      const next = await fetchAiRecipes(activeProfile, aiSelectedItemIds);
      setAiRecipes(next);
      setExpandedAiRecipeIds([]);
      setAiSelectedItemIds([]);
      if (next.length === 0) {
        setAiNotice('AI не повернув рецептів. Спробуйте додати більше продуктів або уточнити дати придатності.');
        setAiNoticeTone('neutral');
      } else {
        setAiNotice(`Готово: отримано ${next.length} AI-рецепт(и).`);
        setAiNoticeTone('ok');
      }
    } catch (e) {
      if (e instanceof AiRequestError) {
        if (e.code === 'ai_invalid_key') {
          setAiNotice('AI ключ недійсний. Замініть OPENAI_API_KEY у apps/server/.env та перезапустіть сервер.');
          setAiNoticeTone('error');
          return;
        }
        if (e.code === 'ai_unconfigured') {
          setAiNotice('AI не налаштовано: додайте OPENAI_API_KEY у apps/server/.env і перезапустіть сервер.');
          setAiNoticeTone('error');
          return;
        }
        if (e.code === 'ai_rate_limited') {
          setAiNotice('Ліміт запитів AI перевищено. Зачекайте хвилину і спробуйте ще раз.');
          setAiNoticeTone('error');
          return;
        }
        if (e.code === 'ai_service_unavailable') {
          setAiNotice('AI сервіс тимчасово недоступний. Спробуйте трохи пізніше.');
          setAiNoticeTone('error');
          return;
        }
        setAiNotice(e.message || 'Не вдалося отримати AI-рецепти.');
        setAiNoticeTone('error');
        return;
      }
      setAiNotice('Невідома помилка AI. Спробуйте ще раз.');
      setAiNoticeTone('error');
    } finally {
      setAiLoading(false);
    }
  }

  const summary = useMemo(() => {
    return inventory.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.insight.status === 'expiring') {
          acc.expiring += 1;
        }
        if (item.insight.status === 'expired') {
          acc.expired += 1;
        }
        return acc;
      },
      { total: 0, expiring: 0, expired: 0 }
    );
  }, [inventory]);

  const fridgeItems = useMemo(() => sortByExpiryPriority(inventory.filter((item) => item.location === 'fridge')), [inventory]);
  const freezerItems = useMemo(() => sortByExpiryPriority(inventory.filter((item) => item.location === 'freezer')), [inventory]);

  async function selectProfile(owner: ProfileOwner) {
    setActiveProfile(owner);
    await AsyncStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, owner);
  }

  async function switchProfile() {
    setActiveProfile(null);
    setInventory([]);
    setAiRecipes([]);
    setAiSelectedItemIds([]);
    setBulkDeleteMode(false);
    setBulkSelectedItemIds([]);
    await AsyncStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY);
  }

  function requestSwitchProfile() {
    Alert.alert('Повернутися до вибору профілю?', 'Ви вийдете з поточного профілю і повернетеся на головний вибір.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Повернутися',
        style: 'destructive',
        onPress: () => {
          void switchProfile();
        }
      }
    ]);
  }

  if (!activeProfile) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <Image source={{ uri: KUROMI_BG_IMAGE_URI }} resizeMode="cover" style={styles.kuromiBackdropImage} />
        <TwinkleStarsDecor />
        <View pointerEvents="none" style={styles.kuromiBackdropOverlay} />
        <View style={[styles.content, { justifyContent: 'center', flexGrow: 1 }]}>
          <View style={styles.hero}>
            <ProfileWaterfallDecor />
            <View style={styles.profilePickerContent}>
            <Text style={styles.eyebrow}>AppFridge</Text>
            <Text style={styles.title}>Оберіть профіль</Text>
            <Text style={styles.subtitle}>У кожного профілю буде окремий список продуктів і своя історія.</Text>
            <View style={styles.profilePickerGrid}>
              <Pressable style={styles.profileCard} onPress={() => void selectProfile('vlad')}>
                <Image source={VLAD_PROFILE_IMAGE} resizeMode="cover" style={styles.profileCardAvatar} />
                <Text style={styles.profileCardName}>Влад</Text>
              </Pressable>
              <Pressable style={styles.profileCard} onPress={() => void selectProfile('rimma')}>
                <Image source={RIMMA_PROFILE_IMAGE} resizeMode="cover" style={styles.profileCardAvatar} />
                <Text style={styles.profileCardName}>Римма</Text>
              </Pressable>
            </View>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Image source={{ uri: KUROMI_BG_IMAGE_URI }} resizeMode="cover" style={styles.kuromiBackdropImage} />
      <TwinkleStarsDecor />
      <View pointerEvents="none" style={styles.kuromiBackdropOverlay} />
      {activeProfile === 'rimma' ? (
        <View pointerEvents="none" style={styles.rimmaBackdropDecorLayer}>
          <Image source={RIMMA_KUROMI_A_IMAGE} resizeMode="contain" style={[styles.rimmaDecorSticker, styles.rimmaDecorA]} />
          <Image source={RIMMA_KUROMI_B_IMAGE} resizeMode="contain" style={[styles.rimmaDecorSticker, styles.rimmaDecorB]} />
          <Image source={RIMMA_KUROMI_C_IMAGE} resizeMode="contain" style={[styles.rimmaDecorSticker, styles.rimmaDecorC]} />
          <Image source={RIMMA_KUROMI_LOGO_IMAGE} resizeMode="contain" style={[styles.rimmaDecorSticker, styles.rimmaDecorD]} />
          <Image source={RIMMA_KUROMI_B_IMAGE} resizeMode="contain" style={[styles.rimmaDecorSticker, styles.rimmaDecorE]} />
          <Image source={RIMMA_KUROMI_A_IMAGE} resizeMode="contain" style={[styles.rimmaDecorSticker, styles.rimmaDecorF]} />
          <Image source={RIMMA_KUROMI_C_IMAGE} resizeMode="contain" style={[styles.rimmaDecorSticker, styles.rimmaDecorG]} />
          <Image source={RIMMA_KUROMI_LOGO_IMAGE} resizeMode="contain" style={[styles.rimmaDecorSticker, styles.rimmaDecorH]} />
        </View>
      ) : null}
      <View pointerEvents="none" style={styles.kuromiDecorWrap}>
        <Text style={styles.kuromiDecorTop}>☠️🖤✨</Text>
        <Text style={styles.kuromiDecorBottom}>KUROMI VIBE</Text>
      </View>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} scrollEnabled={!swipeLock}>
        <View style={styles.hero}>
          <View style={styles.heroHeaderRow}>
            <Image
              source={activeProfile === 'rimma' ? RIMMA_PROFILE_IMAGE : VLAD_PROFILE_IMAGE}
              resizeMode="cover"
              style={styles.heroBadgeImage}
            />
            <View style={styles.heroHeaderTexts}>
              <Text style={styles.eyebrow}>AppFridge</Text>
              <Text style={styles.title}>{activeProfile === 'vlad' ? 'Влад' : 'Римма'} • Розумний холодильник</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>
            Скануйте товар, додайте дату придатності, а AppFridge нагадає, що потрібно використати першочергово.
          </Text>
          <View style={styles.statRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Усього</Text>
              <Text style={styles.statValue}>{summary.total}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Скоро</Text>
              <Text style={styles.statValue}>{summary.expiring}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Прострочено</Text>
              <Text style={styles.statValue}>{summary.expired}</Text>
            </View>
          </View>
          <Pressable style={[styles.aiClearButton, { marginTop: 10 }]} onPress={requestSwitchProfile}>
            <Text style={styles.aiClearButtonText}>Змінити профіль</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Як користуватись</Text>
          <View style={styles.quickStepRow}>
            <Text style={styles.quickStepBadge}>1</Text>
            <Text style={styles.quickStepText}>Натисніть `Відкрити сканер` і відскануйте штрихкод.</Text>
          </View>
          <View style={styles.quickStepRow}>
            <Text style={styles.quickStepBadge}>2</Text>
            <Text style={styles.quickStepText}>Підтвердіть дату придатності (камера або вручну).</Text>
          </View>
          <View style={styles.quickStepRow}>
            <Text style={styles.quickStepBadge}>3</Text>
            <Text style={styles.quickStepText}>Оберіть місце зберігання і збережіть продукт.</Text>
          </View>
          <View style={styles.quickStepRow}>
            <Text style={styles.quickStepBadge}>4</Text>
            <Text style={styles.quickStepText}>За потреби виберіть продукти і отримайте AI-рецепти.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Додати продукт</Text>
          <Text style={styles.sectionText}>
            Один простий потік: скан товару → дата → місце зберігання → готово.
          </Text>

          <Pressable style={styles.button} onPress={requestScanner}>
            <Text style={styles.buttonText}>Відкрити сканер продукту</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Параметри</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingTextWrap}>
              <Text style={styles.settingTitle}>Push повідомлення</Text>
              <Text style={styles.settingHint}>
                {pushEnabled ? 'Отримувати нагадування про строки придатності.' : 'Push вимкнено на цьому пристрої.'}
              </Text>
            </View>
            <Switch
              value={pushEnabled}
              onValueChange={(next) => void handleTogglePush(next)}
              trackColor={{ false: '#5b3a8a', true: '#c084fc' }}
              thumbColor={pushEnabled ? '#7e22ce' : '#ded2f5'}
            />
          </View>
          <Pressable style={[styles.button, styles.buttonSecondary, { marginTop: 12 }]} onPress={requestSwitchProfile}>
            <Text style={styles.buttonTextLight}>Повернутися до вибору профілю</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Продукти</Text>
          <Text style={styles.sectionText}>Позиції розділені за місцем зберігання. Свайп вліво/вправо переносить між секціями.</Text>
          <View style={styles.statusLegendRow}>
            <Text style={styles.statusLegendText}>🟢 Свіжий</Text>
            <Text style={styles.statusLegendText}>🟡 Скоро</Text>
            <Text style={styles.statusLegendText}>🔴 Прострочено</Text>
          </View>
          {bulkDeleteMode ? (
            <View style={styles.bulkActionsRow}>
              <Text style={styles.bulkActionsText}>Вибрано: {bulkSelectedItemIds.length}</Text>
              <View style={styles.bulkActionsButtons}>
                <Pressable style={[styles.inventoryTileAiButton, styles.bulkCancelButton]} onPress={() => setBulkDeleteMode(false)}>
                  <Text style={styles.inventoryTileAiButtonText}>Скасувати</Text>
                </Pressable>
                <Pressable style={[styles.inventoryTileAiButton, styles.bulkDeleteButton]} onPress={requestBulkDelete}>
                  <Text style={styles.inventoryTileAiButtonText}>Видалити</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Text style={styles.scannerHint}>Затисніть картку, щоб вибрати кілька продуктів для видалення.</Text>
          )}

          <View>
            <View style={styles.inventoryGroupHeader}>
            <View style={[styles.inventoryGroupPill, styles.inventoryGroupPillFridge]}>
              <Text style={styles.inventoryGroupPillText}>Холодильник</Text>
            </View>
            <Text style={styles.inventoryGroupCount}>{fridgeItems.length}</Text>
            </View>
            {fridgeItems.length === 0 ? <Text style={styles.inventoryGroupEmpty}>Поки що порожньо.</Text> : null}
            <View style={styles.inventoryGrid}>
              {fridgeItems.map((item) => (
                <MemoInventoryTile
                  key={item.id}
                item={item}
                aiSelected={aiSelectedItemIds.includes(item.id)}
                bulkMode={bulkDeleteMode}
                bulkSelected={bulkSelectedItemIds.includes(item.id)}
                onOpen={setSelectedInventoryItem}
                onToggleAi={toggleAiItemSelection}
                onStartBulkSelect={startBulkSelection}
                onToggleBulkSelect={toggleBulkSelection}
                onSwipeMove={(x, to) => void handleMove(x, to)}
                onSwipeDelete={requestDeleteItem}
                onSwipeActiveChange={setSwipeLock}
              />
            ))}
          </View>
          </View>

          <View>
            <View style={styles.inventoryGroupHeader}>
            <View style={[styles.inventoryGroupPill, styles.inventoryGroupPillFreezer]}>
              <Text style={styles.inventoryGroupPillText}>Морозильна камера</Text>
            </View>
            <Text style={styles.inventoryGroupCount}>{freezerItems.length}</Text>
            </View>
            {freezerItems.length === 0 ? <Text style={styles.inventoryGroupEmpty}>Поки що порожньо.</Text> : null}
            <View style={styles.inventoryGrid}>
              {freezerItems.map((item) => (
                <MemoInventoryTile
                  key={item.id}
                item={item}
                aiSelected={aiSelectedItemIds.includes(item.id)}
                bulkMode={bulkDeleteMode}
                bulkSelected={bulkSelectedItemIds.includes(item.id)}
                onOpen={setSelectedInventoryItem}
                onToggleAi={toggleAiItemSelection}
                onStartBulkSelect={startBulkSelection}
                onToggleBulkSelect={toggleBulkSelection}
                onSwipeMove={(x, to) => void handleMove(x, to)}
                onSwipeDelete={requestDeleteItem}
                onSwipeActiveChange={setSwipeLock}
              />
            ))}
          </View>
          </View>

          <View style={{ marginTop: 16 }}>
            <Text style={styles.sectionTitle}>AI для продуктів</Text>
            <Text style={styles.sectionText}>
              Виберіть потрібні продукти на картках кнопкою `Додати в AI`, і ми згенеруємо рецепти саме для них.
            </Text>
            <Text style={styles.aiSelectionText}>
              {aiSelectedItemIds.length > 0
                ? `Вибрано ${aiSelectedItemIds.length} продукт(и) для AI.`
                : 'Якщо нічого не вибрано, AI використає весь список продуктів.'}
            </Text>
            {aiSelectedItemIds.length > 0 ? (
              <Pressable style={styles.aiClearButton} onPress={() => setAiSelectedItemIds([])}>
                <Text style={styles.aiClearButtonText}>Очистити вибір</Text>
              </Pressable>
            ) : null}
            <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => void handleAiRecipes()} disabled={aiLoading}>
              <Text style={styles.buttonTextLight}>{aiLoading ? 'Генеруємо…' : 'Отримати AI-рецепти'}</Text>
            </Pressable>
            <Text
              style={[
                styles.aiNotice,
                aiNoticeTone === 'error' ? styles.aiNoticeError : undefined,
                aiNoticeTone === 'ok' ? styles.aiNoticeOk : undefined
              ]}
            >
              {aiNotice}
            </Text>

            {aiRecipes.map((recipe) => (
              <View key={recipe.id} style={styles.card}>
                <Text style={styles.recipeBadge}>AI</Text>
                <View style={styles.recipeHeaderRow}>
                  <Text style={styles.recipeTitle}>{recipe.title}</Text>
                  <Pressable
                    style={styles.recipeChevronButton}
                    onPress={() =>
                      setExpandedAiRecipeIds((current) =>
                        current.includes(recipe.id) ? current.filter((id) => id !== recipe.id) : [...current, recipe.id]
                      )
                    }
                  >
                    <Text style={styles.recipeChevronText}>{expandedAiRecipeIds.includes(recipe.id) ? '▾' : '▸'}</Text>
                  </Pressable>
                </View>
                {expandedAiRecipeIds.includes(recipe.id) ? (
                  <>
                    <Text style={styles.recipeBody}>{recipe.description}</Text>
                    {recipe.ingredients.length > 0 ? (
                      <Text style={[styles.recipeBody, { marginTop: 8 }]}>Інгредієнти: {recipe.ingredients.join(', ')}</Text>
                    ) : null}
                    {recipe.steps.map((step, index) => (
                      <Text key={`${recipe.id}-step-${index}`} style={styles.recipeSteps}>
                        {index + 1}. {step}
                      </Text>
                    ))}
                  </>
                ) : null}
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.section, styles.saladSection]}>
          <Text style={styles.sectionTitle}>САЛАТИК МММ...</Text>
          <Text style={[styles.sectionText, styles.saladSectionText]}>
            Окрема лавка з популярними інгредієнтами, які легко купити в Польщі та Україні. Натисніть кнопку й зберіть салат у тарілочку.
          </Text>
          <Pressable style={[styles.button, styles.saladOpenButton]} onPress={() => setSaladModalOpen(true)}>
            <Text style={styles.buttonText}>Відкрити САЛАТИК МММ...</Text>
          </Pressable>
          {saladChefOrders.length > 0 ? (
            <View style={styles.saladOrdersWrap}>
              <Text style={styles.saladOrdersTitle}>Замовлення для шефа</Text>
              {saladChefOrders.map((order) => (
                <Pressable key={order.id} style={styles.saladOrderCard} onPress={() => setSelectedSaladChefOrder(order)}>
                  <View style={styles.saladOrderTopRow}>
                    <Text style={styles.saladOrderName} numberOfLines={2}>
                      {order.title}
                    </Text>
                    <Pressable
                      style={[styles.saladFavoriteButton, favoriteSaladIds.has(order.id) ? styles.saladFavoriteButtonActive : undefined]}
                      onPress={() => toggleFavoriteSalad(order)}
                    >
                      <Text style={styles.saladFavoriteButtonText}>{favoriteSaladIds.has(order.id) ? '♥' : '♡'}</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.saladOrderDesc}>{order.description}</Text>
                  <Text style={styles.saladOrderMeta}>Інгредієнти: {order.ingredients.join(', ')}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {favoriteSalads.length > 0 ? (
            <View style={styles.saladOrdersWrap}>
              <Pressable style={styles.saladFavoritesHeader} onPress={toggleFavoriteSaladsCollapsed}>
                <Text style={styles.saladOrdersTitle}>Улюблені салати ({favoriteSalads.length})</Text>
                <Text style={styles.saladFavoritesChevron}>{favoriteSaladsCollapsed ? '▸' : '▾'}</Text>
              </Pressable>
              {!favoriteSaladsCollapsed
                ? favoriteSalads.map((order) => (
                    <Pressable key={`fav-${order.id}`} style={styles.saladOrderCard} onPress={() => setSelectedSaladChefOrder(order)}>
                      <View style={styles.saladOrderTopRow}>
                        <Text style={styles.saladOrderName} numberOfLines={2}>
                          {order.title}
                        </Text>
                        <Pressable style={[styles.saladFavoriteButton, styles.saladFavoriteButtonActive]} onPress={() => toggleFavoriteSalad(order)}>
                          <Text style={styles.saladFavoriteButtonText}>♥</Text>
                        </Pressable>
                      </View>
                      <Text style={styles.saladOrderDesc}>{order.description}</Text>
                      <Text style={styles.saladOrderMeta}>Інгредієнти: {order.ingredients.join(', ')}</Text>
                    </Pressable>
                  ))
                : null}
            </View>
          ) : null}
        </View>

      </ScrollView>

      <Modal visible={manualProductModalOpen} transparent animationType="fade" onRequestClose={backFromManualProductStep}>
        <View style={styles.detailOverlay}>
          <View style={styles.detailCard}>
            <Text style={styles.sectionTitle}>Товар не знайдено</Text>
            <Text style={styles.sectionText}>Введіть назву продукту і кількість, далі відкриється скан дати придатності.</Text>
            <TextInput
              style={styles.input}
              placeholder="Назва товару"
              placeholderTextColor="#7f95a3"
              value={manualProductName}
              onChangeText={(value) => {
                setManualProductName(value);
                setManualProductCategory(inferProductCategory(value));
              }}
            />
            <Text style={styles.dateHint}>Категорія (авто): {manualProductCategory || 'Інше'}</Text>
            <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => void requestNameCamera()} disabled={nameCaptureBusy}>
              <Text style={styles.buttonTextLight}>{nameCaptureBusy ? 'Зчитуємо…' : 'Сканувати назву з фото'}</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.buttonSecondary]} onPress={confirmManualProductEntry}>
              <Text style={styles.buttonTextLight}>Далі: скан дати</Text>
            </Pressable>
            <Pressable style={styles.detailCloseButton} onPress={backFromManualProductStep}>
              <Text style={styles.detailCloseText}>Скасувати</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={scanning} transparent animationType="fade" onRequestClose={() => setScanning(false)}>
        <View style={styles.detailOverlay}>
          <View style={styles.detailCard}>
            <Text style={styles.sectionTitle}>Сканер штрихкоду</Text>
            <Text style={styles.sectionText}>Наведіть камеру на штрихкод товару.</Text>
            {permission?.granted ? (
              <View style={styles.scannerBox}>
                <CameraView
                  barcodeScannerSettings={{
                    barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr']
                  }}
                  onBarcodeScanned={({ data }) => {
                    const raw = typeof data === 'string' ? data.trim() : '';
                    if (!raw || scanConsumedRef.current) {
                      return;
                    }
                    scanConsumedRef.current = true;
                    setScanning(false);
                    void handleLookup(raw);
                  }}
                  style={{ flex: 1 }}
                />
              </View>
            ) : (
              <Text style={styles.scannerHint}>Потрібен доступ до камери.</Text>
            )}
            <Pressable style={styles.detailCloseButton} onPress={() => setScanning(false)}>
              <Text style={styles.detailCloseText}>Скасувати</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={nameCameraOpen} transparent animationType="fade" onRequestClose={closeNameCameraAndReturn}>
        <View style={styles.detailOverlay}>
          <View style={styles.detailCard}>
            <Text style={styles.sectionTitle}>Скан назви товару</Text>
            <Text style={styles.sectionText}>Наведіть камеру на назву на упаковці і натисніть "Зчитати назву".</Text>
            <View style={styles.scannerBox}>
              <CameraView ref={nameCameraRef} style={{ flex: 1 }} />
            </View>
            <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => void captureProductNameFromPhoto()} disabled={nameCaptureBusy}>
              <Text style={styles.buttonTextLight}>{nameCaptureBusy ? 'Зчитуємо…' : 'Зчитати назву'}</Text>
            </Pressable>
            <PhotoProcessingOverlay inline overlayInParent visible={nameCaptureBusy} label="Розпізнаємо назву продукту" />
            <Pressable style={styles.detailCloseButton} onPress={closeNameCameraAndReturn}>
              <Text style={styles.detailCloseText}>Закрити</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={expiryCameraOpen} transparent animationType="fade" onRequestClose={backFromExpiryCameraStep}>
        <View style={styles.detailOverlay}>
          <View style={styles.detailCard}>
            <Text style={styles.sectionTitle}>Скан дати придатності</Text>
            <Text style={styles.sectionText}>Наведіть камеру на дату на упаковці. Якщо не вийде — є ручний ввід.</Text>
            <View style={styles.scannerBox}>
              <CameraView ref={expiryCameraRef} style={{ flex: 1 }} />
            </View>
            <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => void captureExpiryFromPhoto()} disabled={expiryCaptureBusy}>
              <Text style={styles.buttonTextLight}>{expiryCaptureBusy ? 'Зчитуємо…' : 'Зчитати дату'}</Text>
            </Pressable>
            <PhotoProcessingOverlay inline overlayInParent visible={expiryCaptureBusy} label="Розпізнаємо дату придатності" />
            <Pressable
              style={[styles.button, styles.buttonSecondary]}
              onPress={() => {
                setExpiryCameraOpen(false);
                setTimeout(() => {
                  setManualDateModalOpen(true);
                }, 60);
              }}
              disabled={expiryCaptureBusy}
            >
              <Text style={styles.buttonTextLight}>Ввести дату вручну</Text>
            </Pressable>
            <Pressable style={styles.detailCloseButton} onPress={backFromExpiryCameraStep}>
              <Text style={styles.detailCloseText}>Скасувати</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={manualDateModalOpen} transparent animationType="fade" onRequestClose={backFromManualDateStep}>
        <View style={styles.detailOverlay}>
          <View style={styles.detailCard}>
            <Text style={styles.sectionTitle}>Дата вручну</Text>
            <Text style={styles.sectionText}>Вкажіть день, місяць і рік, далі виберете місце зберігання.</Text>
            <View style={styles.expiryRow}>
              <TextInput
                style={[styles.input, styles.expiryInput]}
                placeholder="DD"
                placeholderTextColor="#7f95a3"
                value={expirationDay}
                onChangeText={(value) => setExpirationDay(value.replace(/\D/g, '').slice(0, 2))}
                keyboardType="numeric"
                maxLength={2}
              />
              <TextInput
                style={[styles.input, styles.expiryInput]}
                placeholder="MM"
                placeholderTextColor="#7f95a3"
                value={expirationMonth}
                onChangeText={(value) => setExpirationMonth(value.replace(/\D/g, '').slice(0, 2))}
                keyboardType="numeric"
                maxLength={2}
              />
              <TextInput
                style={[styles.input, styles.expiryInputYear]}
                placeholder="YYYY"
                placeholderTextColor="#7f95a3"
                value={expirationYear}
                onChangeText={(value) => setExpirationYear(value.replace(/\D/g, '').slice(0, 4))}
                keyboardType="numeric"
                maxLength={4}
              />
            </View>
            <Pressable style={[styles.button, styles.buttonSecondary]} onPress={confirmManualDateEntry}>
              <Text style={styles.buttonTextLight}>Далі: місце і збереження</Text>
            </Pressable>
            <Pressable style={styles.detailCloseButton} onPress={backFromManualDateStep}>
              <Text style={styles.detailCloseText}>Скасувати</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={finalizeModalOpen} transparent animationType="fade" onRequestClose={backFromFinalizeStep}>
        <View style={styles.detailOverlay}>
          <View style={styles.detailCard}>
            <Text style={styles.sectionTitle}>Фінальний крок</Text>
            <Text style={styles.sectionText}>
              Товар: {productName || '—'}{'\n'}
              Дата: {expirationYear}-{expirationMonth}-{expirationDay}
            </Text>
            <Text style={styles.dateHint}>Кількість</Text>
            <QuantityWheel value={Math.max(1, Number(quantity) || 1)} onChange={(next) => setQuantity(String(next))} />
            <View style={styles.locationRow}>
              {LOCATION_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.locationOption, location === option.value ? styles.locationOptionActive : undefined]}
                  onPress={() => setLocation(option.value)}
                >
                  <Text style={styles.locationOptionText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={styles.button} onPress={() => void handleAddItem()}>
              <Text style={styles.buttonText}>Зберегти продукт</Text>
            </Pressable>
            <Pressable style={styles.detailCloseButton} onPress={backFromFinalizeStep}>
              <Text style={styles.detailCloseText}>Скасувати</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(selectedInventoryItem)} transparent animationType="fade" onRequestClose={() => setSelectedInventoryItem(null)}>
        <View style={styles.detailOverlay}>
          <View style={styles.detailCard}>
            {selectedInventoryItem ? (
              <>
                <Text style={styles.detailTitle}>{selectedInventoryItem.name}</Text>
                <Text style={styles.detailLine}>Штрихкод: {selectedInventoryItem.barcode}</Text>
                <Text style={styles.detailLine}>Кількість: {selectedInventoryItem.quantity} шт.</Text>
                <Text style={styles.detailLine}>Місце: {formatLocationLabel(selectedInventoryItem.location)}</Text>
                <Text style={styles.detailLine}>Термін придатності: {formatExpirationLabel(selectedInventoryItem)}</Text>
                <Text style={styles.detailLine}>Статус: {formatStatusLabel(selectedInventoryItem.insight.status)}</Text>
                <Text style={styles.detailLine}>{formatShelfLifeLabel(selectedInventoryItem)}</Text>
                {selectedInventoryItem.category ? <Text style={styles.detailLine}>Категорія: {selectedInventoryItem.category}</Text> : null}

                <Pressable
                  style={[styles.detailAction, aiSelectedItemIds.includes(selectedInventoryItem.id) ? styles.aiPickButtonActive : undefined]}
                  onPress={() => toggleAiItemSelection(selectedInventoryItem.id)}
                >
                  <Text style={styles.detailActionText}>
                    {aiSelectedItemIds.includes(selectedInventoryItem.id) ? 'Прибрати з AI помічника' : 'Додати до AI помічника'}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.detailAction}
                  onPress={() => {
                    const target = selectedInventoryItem.location === 'fridge' ? 'freezer' : 'fridge';
                    void handleMove(selectedInventoryItem, target);
                  }}
                >
                  <Text style={styles.detailActionText}>
                    {selectedInventoryItem.location === 'fridge'
                      ? 'Перемістити в морозильну камеру'
                      : 'Перемістити в холодильник'}
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.detailAction, styles.detailDeleteAction]}
                  onPress={() => {
                    requestDeleteItem(selectedInventoryItem.id);
                  }}
                >
                  <Text style={styles.detailActionText}>Видалити продукт</Text>
                </Pressable>
              </>
            ) : null}
            <Pressable style={styles.detailCloseButton} onPress={() => setSelectedInventoryItem(null)}>
              <Text style={styles.detailCloseText}>Закрити</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={saladModalOpen} transparent animationType="fade" onRequestClose={() => setSaladModalOpen(false)}>
        <View style={styles.detailOverlay}>
          <View style={[styles.detailCard, styles.saladModalCard]}>
            <Text style={styles.sectionTitle}>САЛАТИК МММ...</Text>
            <Text style={styles.sectionText}>Лавка інгредієнтів (PL/UA): додавайте в тарілочку нижче.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.saladTabsRow}>
              {SALAD_CATEGORY_TABS.map((tab) => (
                <Pressable
                  key={tab}
                  style={[styles.saladTabChip, saladCategoryFilter === tab ? styles.saladTabChipActive : undefined]}
                  onPress={() => setSaladCategoryFilter(tab)}
                >
                  <Text style={[styles.saladTabChipText, saladCategoryFilter === tab ? styles.saladTabChipTextActive : undefined]}>{tab}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView style={styles.saladList} contentContainerStyle={styles.saladListContent}>
              {saladVisibleItems.map((item) => (
                <View key={item.name} style={styles.saladItemRow}>
                  <View style={styles.saladItemInfo}>
                    <Text style={styles.saladItemName}>{saladIconForItem(item.name, item.category)} {item.name}</Text>
                    <View style={styles.saladItemMetaRow}>
                      <Text style={styles.saladItemMeta}>{item.category}</Text>
                      <Text style={styles.saladCountryBadge}>{item.country}</Text>
                    </View>
                  </View>
                  <Pressable style={styles.saladAddButton} onPress={() => addToSaladBowl(item.name)}>
                    <Text style={styles.saladAddButtonText}>Додати</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>

            <View style={styles.saladBowlBox}>
              <Text style={styles.saladBowlTitle}>Тарілочка ({saladTotalItems})</Text>
              {saladBowlEntries.length === 0 ? (
                <Text style={styles.saladBowlEmpty}>Поки порожньо. Додайте інгредієнти з лавки.</Text>
              ) : (
                <ScrollView style={styles.saladBowlScroll} showsVerticalScrollIndicator={false}>
                  {saladBowlEntries.map(([name, qty]) => (
                    <View key={name} style={styles.saladBowlRow}>
                      <Text style={styles.saladBowlItem}>{name} × {qty}</Text>
                      <Pressable style={styles.saladRemoveButton} onPress={() => removeFromSaladBowl(name)}>
                        <Text style={styles.saladRemoveButtonText}>-1</Text>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
            <View style={styles.bulkActionsButtons}>
              <Pressable style={[styles.inventoryTileAiButton, styles.bulkCancelButton]} onPress={() => setSaladBowl({})}>
                <Text style={styles.inventoryTileAiButtonText}>Очистити тарілочку</Text>
              </Pressable>
              <Pressable
                style={[styles.inventoryTileAiButton, styles.saladDoneButton, saladChefLoading ? styles.actionButtonDisabled : undefined]}
                onPress={() => void generateSaladChefOrders()}
                disabled={saladChefLoading}
              >
                <Text style={styles.inventoryTileAiButtonText}>{saladChefLoading ? 'Готуємо…' : 'Замовити шефу'}</Text>
              </Pressable>
              <Pressable style={[styles.inventoryTileAiButton, styles.saladDoneButton]} onPress={() => setSaladModalOpen(false)}>
                <Text style={styles.inventoryTileAiButtonText}>Готово</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={saladChefLoading} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.saladLoadingFullscreenOverlay}>
          <View style={[styles.processingCard, styles.saladLoadingFullscreenCard]}>
            <SaladChefLoadingOverlay visible={saladChefLoading} />
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(selectedSaladChefOrder)} transparent animationType="fade" onRequestClose={() => setSelectedSaladChefOrder(null)}>
        <View style={styles.detailOverlay}>
          <View style={[styles.detailCard, styles.saladRecipeDetailCard]}>
            {selectedSaladChefOrder ? (
              <ScrollView style={styles.saladRecipeScroll} contentContainerStyle={styles.saladRecipeScrollContent}>
                <Text style={styles.detailTitle}>{selectedSaladChefOrder.title}</Text>
                <Text style={styles.detailLine}>{selectedSaladChefOrder.description}</Text>
                <Text style={[styles.detailLine, { marginTop: 8 }]}>Інгредієнти: {selectedSaladChefOrder.ingredients.join(', ')}</Text>
                {selectedSaladChefOrder.steps.map((step, index) => (
                  <Text key={`${selectedSaladChefOrder.id}-step-${index}`} style={styles.recipeSteps}>
                    {index + 1}. {step}
                  </Text>
                ))}
              </ScrollView>
            ) : null}
            <Pressable style={styles.detailCloseButton} onPress={() => setSelectedSaladChefOrder(null)}>
              <Text style={styles.detailCloseText}>Закрити</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
