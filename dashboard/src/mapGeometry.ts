export const MAP_SCALE_X = 5.35;
export const MAP_SCALE_Y = 3.12;
export const MAP_PLANE_WIDTH = 12;
export const MAP_PLANE_HEIGHT = 7.1;
export const MAP_IMAGE_ASPECT = 1672 / 940;

export interface MapCoordinate {
  x: number;
  y: number;
}

export interface PhysicalCoordinate {
  eastM: number;
  northM: number;
}

function solveLinear(matrix: number[][], values: number[]) {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-12) throw new Error("标定点几何分布无法求解单应矩阵");
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  return augmented.map((row) => row[size]);
}

export function computeHomography(
  points: Array<MapCoordinate & PhysicalCoordinate>,
): number[] {
  if (points.length < 4) throw new Error("至少需要 4 个控制点");
  const rows: number[][] = [];
  const values: number[] = [];
  points.forEach(({ eastM: x, northM: y, x: u, y: v }) => {
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    values.push(u);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    values.push(v);
  });
  if (rows.length === 8) return [...solveLinear(rows, values), 1];
  const normal = Array.from({ length: 8 }, () => Array(8).fill(0));
  const target = Array(8).fill(0);
  rows.forEach((row, rowIndex) => {
    row.forEach((left, i) => {
      target[i] += left * values[rowIndex];
      row.forEach((right, j) => { normal[i][j] += left * right; });
    });
  });
  return [...solveLinear(normal, target), 1];
}

export function invertHomography(matrix: number[]) {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const A = e * i - f * h;
  const B = c * h - b * i;
  const C = b * f - c * e;
  const D = f * g - d * i;
  const E = a * i - c * g;
  const F = c * d - a * f;
  const G = d * h - e * g;
  const H = b * g - a * h;
  const I = a * e - b * d;
  const determinant = a * A + b * D + c * G;
  if (Math.abs(determinant) < 1e-12) throw new Error("单应矩阵不可逆");
  return [A, B, C, D, E, F, G, H, I].map((value) => value / determinant);
}

export function projectCoordinate(matrix: number[], x: number, y: number): MapCoordinate {
  const denominator = matrix[6] * x + matrix[7] * y + matrix[8];
  if (Math.abs(denominator) < 1e-12) throw new Error("投影坐标无效");
  return {
    x: (matrix[0] * x + matrix[1] * y + matrix[2]) / denominator,
    y: (matrix[3] * x + matrix[4] * y + matrix[5]) / denominator,
  };
}

export function physicalToMap(matrix: number[], point: PhysicalCoordinate) {
  return projectCoordinate(matrix, point.eastM, point.northM);
}

export function mapToPhysical(matrix: number[], point: MapCoordinate): PhysicalCoordinate {
  const projected = projectCoordinate(matrix, point.x, point.y);
  return { eastM: projected.x, northM: projected.y };
}

export function clampMapCoordinate(point: MapCoordinate): MapCoordinate {
  const maxX = MAP_PLANE_WIDTH / 2 / MAP_SCALE_X;
  const maxY = MAP_PLANE_HEIGHT / 2 / MAP_SCALE_Y;
  return {
    x: Math.max(-maxX, Math.min(maxX, point.x)),
    y: Math.max(-maxY, Math.min(maxY, point.y)),
  };
}

export function mapPointToPercent(point: MapCoordinate) {
  const left = ((point.x * MAP_SCALE_X + MAP_PLANE_WIDTH / 2) / MAP_PLANE_WIDTH) * 100;
  const top = ((MAP_PLANE_HEIGHT / 2 - point.y * MAP_SCALE_Y) / MAP_PLANE_HEIGHT) * 100;
  return { left, top };
}

export function percentToMapPoint(left: number, top: number): MapCoordinate {
  return clampMapCoordinate({
    x: ((left / 100) * MAP_PLANE_WIDTH - MAP_PLANE_WIDTH / 2) / MAP_SCALE_X,
    y: (MAP_PLANE_HEIGHT / 2 - (top / 100) * MAP_PLANE_HEIGHT) / MAP_SCALE_Y,
  });
}

export function clientPointToMapPoint(clientX: number, clientY: number, rect: DOMRect): MapCoordinate {
  const left = ((clientX - rect.left) / Math.max(rect.width, 1)) * 100;
  const top = ((clientY - rect.top) / Math.max(rect.height, 1)) * 100;
  return percentToMapPoint(left, top);
}

export function roundMapCoordinate(point: MapCoordinate): MapCoordinate {
  return {
    x: Number(point.x.toFixed(3)),
    y: Number(point.y.toFixed(3)),
  };
}
