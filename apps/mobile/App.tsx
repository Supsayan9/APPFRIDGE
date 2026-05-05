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
  scanProductNameFromImage,
  unregisterPushToken,
  updateInventoryItem
} from './src/api';
import { registerForPushNotificationsAsync } from './src/notifications';
import { styles } from './src/styles';
import type { InventoryResponseItem } from './src/types';

type LocationType = 'fridge' | 'freezer' | 'pantry';
type AiNoticeTone = 'neutral' | 'ok' | 'error';
type DateStepSource = 'camera' | 'manual';

const LOCATION_OPTIONS: Array<{ value: LocationType; label: string }> = [
  { value: 'fridge', label: 'Холодильник' },
  { value: 'freezer', label: 'Морозильна камера' }
];
const KUROMI_BG_IMAGE_URI = 'https://upload.wikimedia.org/wikipedia/commons/7/74/Kuromi_clothing_and_accessories.jpg';
const KUROMI_TITLE_IMAGE_URI = 'https://upload.wikimedia.org/wikipedia/commons/7/74/Kuromi_clothing_and_accessories.jpg';
const PUSH_ENABLED_STORAGE_KEY = '@appfridge_push_enabled';
const PUSH_TOKEN_STORAGE_KEY = '@appfridge_push_token';

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
  onOpen: (item: InventoryResponseItem) => void;
  onToggleAi: (id: string) => void;
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
  onOpen,
  onToggleAi,
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

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.inventoryTile,
        statusBorderStyle,
        { transform: [{ translateX }, { translateY }] }
      ]}
    >
      <Pressable style={styles.inventoryTileTop} onPress={() => onOpen(item)}>
        <Text numberOfLines={2} style={styles.inventoryTileTitle}>
          {item.name}
        </Text>
        <Text style={styles.inventoryTileMeta}>{item.quantity} шт.</Text>
        <Text style={styles.inventoryTileMeta}>{formatExpirationLabel(item)}</Text>
        <Text style={styles.inventoryTileStatus}>{formatShelfLifeLabel(item)}</Text>
        <Text style={styles.inventoryDragHint}>
          {item.location === 'fridge' ? 'Свайп вправо → у морозилку' : 'Свайп вліво → у холодильник'} • Свайп вгору → видалити
        </Text>
        {aiSelected ? <Text style={styles.inventoryTileAiTag}>В AI</Text> : null}
      </Pressable>

      <Pressable style={[styles.inventoryTileAiButton, aiSelected ? styles.inventoryTileAiButtonActive : undefined]} onPress={() => onToggleAi(item.id)}>
        <Text style={styles.inventoryTileAiButtonText}>{aiSelected ? 'В AI' : 'Додати в AI'}</Text>
      </Pressable>
    </Animated.View>
  );
}

const MemoInventoryTile = memo(
  InventoryTile,
  (prev, next) =>
    prev.aiSelected === next.aiSelected &&
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
  const [manualProductQuantity, setManualProductQuantity] = useState('1');
  const [manualProductCategory, setManualProductCategory] = useState<ProductCategory | ''>('');
  const [loading, setLoading] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [aiRecipes, setAiRecipes] = useState<RecipeSuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSelectedItemIds, setAiSelectedItemIds] = useState<string[]>([]);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<InventoryResponseItem | null>(null);
  const [aiNotice, setAiNotice] = useState<string>('Порада: додайте 2-3 продукти зі строком до 7 днів, тоді AI дає найкращі рецепти.');
  const [aiNoticeTone, setAiNoticeTone] = useState<AiNoticeTone>('neutral');
  const [swipeLock, setSwipeLock] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [pushSettingReady, setPushSettingReady] = useState(false);
  const inventoryLoadInFlightRef = useRef(false);
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
    loadInventory();
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

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
  }, [inventory]);

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

  async function loadInventory() {
    if (inventoryLoadInFlightRef.current) {
      return;
    }
    inventoryLoadInFlightRef.current = true;
    try {
      const items = await fetchInventory();
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
      setManualProductQuantity('1');
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
      setManualProductQuantity('1');
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
    const nextQty = Math.max(1, Number(manualProductQuantity) || 1);
    const autoCategory = manualProductCategory || inferProductCategory(name);
    setProductName(name);
    setProductCategory(autoCategory);
    setQuantity(String(nextQty));
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
      const created = await addInventoryItem({
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
      await removeInventoryItem(id);
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
      const { item: updated, mergedRemovedId } = await updateInventoryItem(id, patch);
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
      const next = await fetchAiRecipes(aiSelectedItemIds);
      setAiRecipes(next);
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

  const fridgeItems = useMemo(() => inventory.filter((item) => item.location === 'fridge'), [inventory]);
  const freezerItems = useMemo(() => inventory.filter((item) => item.location === 'freezer'), [inventory]);

  return (
    <SafeAreaView style={styles.screen}>
      <Image source={{ uri: KUROMI_BG_IMAGE_URI }} resizeMode="cover" style={styles.kuromiBackdropImage} />
      <View pointerEvents="none" style={styles.kuromiBackdropOverlay} />
      <View pointerEvents="none" style={styles.kuromiDecorWrap}>
        <Text style={styles.kuromiDecorTop}>☠️🖤✨</Text>
        <Text style={styles.kuromiDecorBottom}>KUROMI VIBE</Text>
      </View>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} scrollEnabled={!swipeLock}>
        <View style={styles.hero}>
          <View style={styles.heroHeaderRow}>
            <Image source={{ uri: KUROMI_TITLE_IMAGE_URI }} resizeMode="cover" style={styles.heroBadgeImage} />
            <View style={styles.heroHeaderTexts}>
              <Text style={styles.eyebrow}>AppFridge</Text>
              <Text style={styles.title}>Розумний холодильник за штрихкодом</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>
            Звичайний штрихкод зазвичай визначає сам товар, але не містить дату придатності. Тому дату ви вводите вручну, а застосунок стежить за строками та надсилає нагадування.
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
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Додати продукт</Text>
          <Text style={styles.sectionText}>
            Один потік: скануєте штрихкод → якщо товар знайдено, одразу фото дати; якщо ні, вводите назву та кількість → фото дати → вибір місця → збереження.
          </Text>

          <Pressable style={styles.button} onPress={requestScanner}>
            <Text style={styles.buttonText}>Відкрити сканер</Text>
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
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Продукти</Text>
          <Text style={styles.sectionText}>Позиції розділені за місцем зберігання.</Text>

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
                onOpen={setSelectedInventoryItem}
                onToggleAi={toggleAiItemSelection}
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
                onOpen={setSelectedInventoryItem}
                onToggleAi={toggleAiItemSelection}
                onSwipeMove={(x, to) => void handleMove(x, to)}
                onSwipeDelete={requestDeleteItem}
                onSwipeActiveChange={setSwipeLock}
              />
            ))}
          </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI помічник</Text>
          <Text style={styles.sectionText}>
            Генерує 1-3 рецепти з продуктів, у яких термін найкритичніший. Якщо ключ невалідний або сервер недоступний, підказка зʼявиться нижче без спливаючих помилок.
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
              <Text style={styles.recipeTitle}>{recipe.title}</Text>
              <Text style={styles.recipeBody}>{recipe.description}</Text>
              {recipe.ingredients.length > 0 ? (
                <Text style={[styles.recipeBody, { marginTop: 8 }]}>Інгредієнти: {recipe.ingredients.join(', ')}</Text>
              ) : null}
              {recipe.steps.map((step, index) => (
                <Text key={`${recipe.id}-step-${index}`} style={styles.recipeSteps}>
                  {index + 1}. {step}
                </Text>
              ))}
            </View>
          ))}
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
            <TextInput
              style={styles.input}
              placeholder="Кількість"
              placeholderTextColor="#7f95a3"
              value={manualProductQuantity}
              onChangeText={(value) => setManualProductQuantity(value.replace(/\D/g, '').slice(0, 3))}
              keyboardType="numeric"
              maxLength={3}
            />
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

      <Modal visible={expiryCameraOpen} transparent animationType="fade" onRequestClose={() => setExpiryCameraOpen(false)}>
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
            <Pressable style={styles.detailCloseButton} onPress={() => setExpiryCameraOpen(false)}>
              <Text style={styles.detailCloseText}>Закрити</Text>
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
    </SafeAreaView>
  );
}
