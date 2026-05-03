import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';
import { StatusBar } from 'expo-status-bar';
import { buildRecipeSuggestions, formatDaysLabel } from '@appfridge/shared';
import { addInventoryItem, fetchInventory, lookupProduct, registerPushToken, removeInventoryItem } from './src/api';
import { registerForPushNotificationsAsync } from './src/notifications';
import { styles } from './src/styles';
import type { InventoryResponseItem } from './src/types';

type LocationType = 'fridge' | 'freezer' | 'pantry';

export default function App() {
  const [inventory, setInventory] = useState<InventoryResponseItem[]>([]);
  const [barcode, setBarcode] = useState('');
  const [productName, setProductName] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [location, setLocation] = useState<LocationType>('fridge');
  const [scanning, setScanning] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadInventory();
    registerPushNotifications();
  }, []);

  async function registerPushNotifications() {
    const registration = await registerForPushNotificationsAsync();
    if (!registration) {
      return;
    }
    try {
      await registerPushToken(registration);
    } catch {
      // Backend may be offline during development.
    }
  }

  async function loadInventory() {
    try {
      const items = await fetchInventory();
      setInventory(items);
    } catch {
      Alert.alert('Backend недоступен', 'Запустите server перед проверкой мобильного приложения.');
    }
  }

  async function handleLookup(targetBarcode?: string) {
    const code = (targetBarcode ?? barcode).trim();
    if (!code) {
      return;
    }

    setLoading(true);
    setBarcode(code);

    try {
      const product = await lookupProduct(code);
      setProductName(product.name);
    } catch {
      Alert.alert('Ошибка', 'Не удалось найти продукт по штрихкоду.');
    } finally {
      setLoading(false);
    }
  }

  async function requestScanner() {
    const result = await BarCodeScanner.requestPermissionsAsync();
    setHasCameraPermission(result.status === 'granted');
    setScanning(result.status === 'granted');
  }

  async function handleAddItem() {
    if (!barcode || !productName || !expirationDate) {
      Alert.alert('Не хватает данных', 'Нужны штрихкод, название и дата окончания.');
      return;
    }

    try {
      const created = await addInventoryItem({
        barcode,
        name: productName,
        expirationDate,
        quantity: Math.max(1, Number(quantity) || 1),
        location
      });

      setInventory((current) => [created, ...current]);
      setBarcode('');
      setProductName('');
      setExpirationDate('');
      setQuantity('1');
      setLocation('fridge');
    } catch {
      Alert.alert('Ошибка', 'Не удалось добавить продукт в backend.');
    }
  }

  async function handleDeleteItem(id: string) {
    await removeInventoryItem(id);
    setInventory((current) => current.filter((item) => item.id !== id));
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

  const recipes = buildRecipeSuggestions(inventory);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>AppFridge</Text>
          <Text style={styles.title}>Barcode to fridge intelligence</Text>
          <Text style={styles.subtitle}>
            Штрихкод обычно говорит, что это за товар, но не хранит дату годности. Поэтому дата вводится вручную, а приложение следит за сроками и шлёт push.
          </Text>
          <View style={styles.statRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Всего</Text>
              <Text style={styles.statValue}>{summary.total}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Скоро</Text>
              <Text style={styles.statValue}>{summary.expiring}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Просрочено</Text>
              <Text style={styles.statValue}>{summary.expired}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Добавить продукт</Text>
          <Text style={styles.sectionText}>Сканируйте штрихкод, подтяните товар, потом укажите дату окончания.</Text>

          <Pressable style={styles.button} onPress={requestScanner}>
            <Text style={styles.buttonText}>Открыть сканер</Text>
          </Pressable>

          {scanning && hasCameraPermission && (
            <View style={styles.scannerBox}>
              <BarCodeScanner
                onBarCodeScanned={({ data }) => {
                  setScanning(false);
                  void handleLookup(data);
                }}
                style={{ flex: 1 }}
              />
            </View>
          )}

          {hasCameraPermission === false && <Text style={styles.scannerHint}>Нужен доступ к камере.</Text>}

          <TextInput style={styles.input} placeholder="Barcode" placeholderTextColor="#7f95a3" value={barcode} onChangeText={setBarcode} />
          <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => handleLookup()} disabled={loading}>
            <Text style={styles.buttonTextLight}>{loading ? 'Поиск...' : 'Найти товар'}</Text>
          </Pressable>
          <TextInput style={styles.input} placeholder="Product name" placeholderTextColor="#7f95a3" value={productName} onChangeText={setProductName} />
          <TextInput style={styles.input} placeholder="Expiration date YYYY-MM-DD" placeholderTextColor="#7f95a3" value={expirationDate} onChangeText={setExpirationDate} />
          <TextInput style={styles.input} placeholder="Quantity" placeholderTextColor="#7f95a3" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Location: fridge/freezer/pantry" placeholderTextColor="#7f95a3" value={location} onChangeText={(value) => setLocation((value as LocationType) || 'fridge')} />

          <Pressable style={styles.button} onPress={handleAddItem}>
            <Text style={styles.buttonText}>Сохранить продукт</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Холодильник</Text>
          <Text style={styles.sectionText}>Список приходит из backend и уже отсортирован по сроку годности.</Text>

          {inventory.map((item) => (
            <View
              key={item.id}
              style={[
                styles.card,
                item.insight.status === 'expired' ? styles.cardDanger : undefined,
                item.insight.status === 'expiring' ? styles.cardWarn : undefined
              ]}
            >
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardMeta}>
                {item.quantity} pcs · {item.location} · {item.expirationDate}
              </Text>
              <Text style={styles.status}>{formatDaysLabel(item.insight.daysLeft)}</Text>
              <Pressable onPress={() => void handleDeleteItem(item.id)}>
                <Text style={styles.removeText}>Удалить</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Что приготовить</Text>
          <Text style={styles.sectionText}>Рецепты строятся из продуктов, которые истекают быстрее остальных.</Text>

          {recipes.map((recipe) => (
            <View key={recipe.id} style={styles.card}>
              <Text style={styles.recipeTitle}>{recipe.title}</Text>
              <Text style={styles.recipeBody}>{recipe.description}</Text>
              <Text style={[styles.recipeBody, { marginTop: 8 }]}>Ingredients: {recipe.ingredients.join(', ')}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
